import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow, clipboard, ipcMain, shell } from "electron";
import { join } from "path";
import { SerialPort } from "serialport";

type SnifferDirection = "RX" | "TX" | "INFO" | "ERROR";

interface SnifferLog {
    timestamp: number;
    direction: SnifferDirection;
    text: string;
    hex?: string;
}

interface SnifferState {
    connected: boolean;
    physicalPortPath: string | null;
    relayPortPath: string | null;
    baudRate: number;
}

interface ConnectPayload {
    physicalPath: string;
    relayPath: string;
    baudRate: number;
}

interface TxPayload {
    text: string;
    hexMode?: boolean;
}

export class App {
    private mainWindowRef: BrowserWindow | null = null;

    private physicalPort: SerialPort | null = null;

    private relayPort: SerialPort | null = null;

    // 단편화된 청크를 묶기 위한 디바운스 버퍼
    private rxBuffer: Buffer[] = [];

    private txBuffer: Buffer[] = [];

    private rxFlushTimer: ReturnType<typeof setTimeout> | null = null;

    private txFlushTimer: ReturnType<typeof setTimeout> | null = null;

    private static readonly FLUSH_DELAY_MS = 20;

    private readonly snifferState: SnifferState = {
        connected: false,
        physicalPortPath: null,
        relayPortPath: null,
        baudRate: 115200,
    };

    public bootstrap(): void {
        app.whenReady().then(() => {
            electronApp.setAppUserModelId("com.electron");

            app.on("browser-window-created", (_, window) => {
                optimizer.watchWindowShortcuts(window);
            });

            this.registerIpcHandlers();
            this.createWindow();

            app.on("activate", () => {
                if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
            });
        });

        app.on("window-all-closed", () => {
            if (process.platform !== "darwin") {
                app.quit();
            }
        });

        app.on("before-quit", () => {
            void this.closeAllPorts();
        });
    }

    private createWindow(): void {
        const mainWindow = new BrowserWindow({
            width: 1200,
            height: 760,
            show: false,
            autoHideMenuBar: true,
            webPreferences: {
                preload: join(__dirname, "../preload/index.js"),
                sandbox: false,
            },
        });

        this.mainWindowRef = mainWindow;

        mainWindow.on("ready-to-show", () => {
            mainWindow.show();
        });

        mainWindow.webContents.setWindowOpenHandler((details) => {
            shell.openExternal(details.url);

            return { action: "deny" };
        });

        if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
            mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
        } else {
            mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
        }

        mainWindow.on("closed", () => {
            if (this.mainWindowRef === mainWindow) {
                this.mainWindowRef = null;
            }
        });
    }

    private registerIpcHandlers(): void {
        ipcMain.handle("sniffer:list-ports", async () => SerialPort.list());
        ipcMain.handle("sniffer:get-state", async () => this.snifferState);
        ipcMain.handle("sniffer:connect", async (_event, payload: ConnectPayload) => this.connectSniffer(payload));
        ipcMain.handle("sniffer:disconnect", async () => this.disconnectSniffer());
        ipcMain.handle("sniffer:send-tx", async (_event, payload: TxPayload) => {
            await this.sendTxToPhysical(payload);

            return true;
        });
        ipcMain.handle("sniffer:copy", async (_event, text: string) => {
            clipboard.writeText(text);

            return true;
        });
    }

    private toHexString(data: Buffer): string {
        return Array.from(data)
            .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
            .join(" ");
    }

    private toDisplayText(data: Buffer): string {
        // \r\n / \n / \r → 실제 개행으로 유지 (콘솔에서 white-space:pre-wrap 으로 렌더링)
        const text = data
            .toString("utf8")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/\t/g, "\\t")
            .replace(/\0/g, "\\0");

        return Array.from(text, (char) => {
            const code = char.charCodeAt(0);
            const isControl =
                (code >= 1 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;

            return isControl ? `\\x${code.toString(16).padStart(2, "0").toUpperCase()}` : char;
        }).join("");
    }

    private scheduleFlush(direction: "RX" | "TX"): void {
        const isRx = direction === "RX";
        const buf = isRx ? this.rxBuffer : this.txBuffer;

        const flush = (): void => {
            if (isRx) this.rxFlushTimer = null;
            else this.txFlushTimer = null;

            if (buf.length === 0) return;
            const combined = Buffer.concat(buf);
            buf.length = 0;
            this.pushDataLog(direction, combined);
        };

        if (isRx) {
            if (this.rxFlushTimer) clearTimeout(this.rxFlushTimer);
            this.rxFlushTimer = setTimeout(flush, App.FLUSH_DELAY_MS);
        } else {
            if (this.txFlushTimer) clearTimeout(this.txFlushTimer);
            this.txFlushTimer = setTimeout(flush, App.FLUSH_DELAY_MS);
        }
    }

    private pushDataLog(direction: SnifferDirection, data: Buffer): void {
        this.sendLog({
            timestamp: Date.now(),
            direction,
            text: this.toDisplayText(data),
            hex: this.toHexString(data),
        });
    }

    private sendLog(log: SnifferLog): void {
        this.mainWindowRef?.webContents.send("sniffer:log", log);
    }

    private sendState(): void {
        this.mainWindowRef?.webContents.send("sniffer:state", this.snifferState);
    }

    private pushInfo(text: string): void {
        this.sendLog({ timestamp: Date.now(), direction: "INFO", text });
    }

    private pushError(text: string): void {
        this.sendLog({ timestamp: Date.now(), direction: "ERROR", text });
    }

    private openPort(path: string, baudRate: number): Promise<SerialPort> {
        return new Promise<SerialPort>((resolve, reject) => {
            const port = new SerialPort({ path, baudRate, autoOpen: false });
            port.open((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(port);
                }
            });
        });
    }

    private closePort(port: SerialPort): Promise<void> {
        return new Promise<void>((resolve) => {
            if (!port.isOpen) {
                resolve();

                return;
            }
            port.close(() => resolve());
        });
    }

    private async closeAllPorts(): Promise<void> {
        // 대기 중인 로그 버퍼 즉시 플러시
        if (this.rxFlushTimer) {
            clearTimeout(this.rxFlushTimer);
            this.rxFlushTimer = null;
            if (this.rxBuffer.length > 0) {
                this.pushDataLog("RX", Buffer.concat(this.rxBuffer));
                this.rxBuffer = [];
            }
        }
        if (this.txFlushTimer) {
            clearTimeout(this.txFlushTimer);
            this.txFlushTimer = null;
            if (this.txBuffer.length > 0) {
                this.pushDataLog("TX", Buffer.concat(this.txBuffer));
                this.txBuffer = [];
            }
        }

        const tasks: Promise<void>[] = [];

        if (this.physicalPort) {
            tasks.push(this.closePort(this.physicalPort));
            this.physicalPort = null;
        }

        if (this.relayPort) {
            tasks.push(this.closePort(this.relayPort));
            this.relayPort = null;
        }

        await Promise.all(tasks);
    }

    private async disconnectSniffer(): Promise<SnifferState> {
        await this.closeAllPorts();

        this.snifferState.connected = false;
        this.snifferState.physicalPortPath = null;
        this.snifferState.relayPortPath = null;

        this.pushInfo("연결이 해제되었습니다.");
        this.sendState();

        return this.snifferState;
    }

    private async connectSniffer(payload: ConnectPayload): Promise<SnifferState> {
        if (!payload.physicalPath || !payload.relayPath) {
            throw new Error("물리 포트와 릴레이 포트 경로가 모두 필요합니다.");
        }

        if (this.snifferState.connected) {
            await this.disconnectSniffer();
        }

        const [physical, relay] = await Promise.all([
            this.openPort(payload.physicalPath, payload.baudRate),
            this.openPort(payload.relayPath, payload.baudRate),
        ]);

        this.physicalPort = physical;
        this.relayPort = relay;

        this.snifferState.connected = true;
        this.snifferState.physicalPortPath = payload.physicalPath;
        this.snifferState.relayPortPath = payload.relayPath;
        this.snifferState.baudRate = payload.baudRate;

        // 앱 기준 RX: 물리 포트(센서)에서 들어온 데이터
        physical.on("data", (chunk: Buffer) => {
            // 릴레이는 즉시 전달
            relay.write(chunk, (err) => {
                if (err) this.pushError(`RX 릴레이 오류: ${err.message}`);
            });
            // 로그는 디바운싱으로 묶어서 한 줄 처리
            this.rxBuffer.push(chunk);
            this.scheduleFlush("RX");
        });

        // 앱 기준 TX: 물리 포트(센서)로 나가는 데이터
        relay.on("data", (chunk: Buffer) => {
            // 릴레이는 즉시 전달
            physical.write(chunk, (err) => {
                if (err) this.pushError(`TX 릴레이 오류: ${err.message}`);
            });
            // 로그는 디바운싱으로 묶어서 한 줄 처리
            this.txBuffer.push(chunk);
            this.scheduleFlush("TX");
        });

        physical.on("error", (err: Error) => {
            this.pushError(`물리 포트 오류: ${err.message}`);
        });

        relay.on("error", (err: Error) => {
            this.pushError(`릴레이 포트 오류: ${err.message}`);
        });

        const handleClose = (): void => {
            if (!this.snifferState.connected) return;
            this.snifferState.connected = false;
            this.snifferState.physicalPortPath = null;
            this.snifferState.relayPortPath = null;
            this.pushInfo("포트가 닫혔습니다.");
            this.sendState();
        };

        physical.on("close", handleClose);
        relay.on("close", handleClose);

        this.pushInfo(`물리 포트 ${payload.physicalPath} 연결됨`);
        this.pushInfo(`릴레이 포트 ${payload.relayPath} 연결됨`);
        this.sendState();

        return this.snifferState;
    }

    private async sendTxToPhysical(payload: TxPayload): Promise<void> {
        if (!this.physicalPort?.isOpen) {
            throw new Error("현재 연결된 물리 포트가 없습니다.");
        }

        let outBuffer: Buffer;

        if (payload.hexMode) {
            const normalized = payload.text.replace(/\s+/g, "");
            if (normalized.length === 0 || normalized.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(normalized)) {
                throw new Error("HEX 모드에서는 짝수 길이의 16진수 문자열을 입력해야 합니다.");
            }
            outBuffer = Buffer.from(normalized, "hex");
        } else {
            outBuffer = Buffer.from(payload.text, "utf8");
        }

        await new Promise<void>((resolve, reject) => {
            this.physicalPort?.write(outBuffer, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        this.pushDataLog("TX", outBuffer);
    }
}
