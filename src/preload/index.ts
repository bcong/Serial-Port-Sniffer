import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, ipcRenderer } from "electron";

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

interface PortInfo {
    path: string;
    manufacturer?: string;
    serialNumber?: string;
    pnpId?: string;
    locationId?: string;
    vendorId?: string;
    productId?: string;
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

const api = {
    listPorts: (): Promise<PortInfo[]> => ipcRenderer.invoke("sniffer:list-ports"),
    getState: (): Promise<SnifferState> => ipcRenderer.invoke("sniffer:get-state"),
    connect: (payload: ConnectPayload): Promise<SnifferState> => ipcRenderer.invoke("sniffer:connect", payload),
    disconnect: (): Promise<SnifferState> => ipcRenderer.invoke("sniffer:disconnect"),
    sendTx: (payload: TxPayload): Promise<boolean> => ipcRenderer.invoke("sniffer:send-tx", payload),
    copyText: (text: string): Promise<boolean> => ipcRenderer.invoke("sniffer:copy", text),
    onLog: (callback: (payload: SnifferLog) => void): (() => void) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: SnifferLog): void => callback(payload);
        ipcRenderer.on("sniffer:log", listener);

        return () => ipcRenderer.removeListener("sniffer:log", listener);
    },
    onState: (callback: (payload: SnifferState) => void): (() => void) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: SnifferState): void => callback(payload);
        ipcRenderer.on("sniffer:state", listener);

        return () => ipcRenderer.removeListener("sniffer:state", listener);
    },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld("electron", electronAPI);
        contextBridge.exposeInMainWorld("api", api);
    } catch (error) {
        console.error(error);
    }
} else {
    // @ts-ignore (define in dts)
    window.electron = electronAPI;
    // @ts-ignore (define in dts)
    window.api = api;
}
