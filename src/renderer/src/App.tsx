import { useEffect, useRef, useState } from "react";

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
}

function App(): React.JSX.Element {
    const [ports, setPorts] = useState<PortInfo[]>([]);
    const [physicalPort, setPhysicalPort] = useState("");
    const [relayPort, setRelayPort] = useState("");
    const [baudRate, setBaudRate] = useState(115200);
    const [connectedState, setConnectedState] = useState<SnifferState>({
        connected: false,
        physicalPortPath: null,
        relayPortPath: null,
        baudRate: 115200,
    });
    const [logs, setLogs] = useState<SnifferLog[]>([]);
    const [autoScroll, setAutoScroll] = useState(true);
    const [txText, setTxText] = useState("");
    const [hexMode, setHexMode] = useState(false);
    const [busy, setBusy] = useState(false);
    const [statusMessage, setStatusMessage] = useState("대기 중");
    const logsRef = useRef<HTMLDivElement | null>(null);

    const appendStatus = (message: string): void => {
        setStatusMessage(message);
    };

    const refreshPorts = async (): Promise<void> => {
        try {
            const list = await window.api.listPorts();
            setPorts(list);

            if (list.length === 0) {
                setPhysicalPort("");
                setRelayPort("");
                appendStatus("연결 가능한 시리얼 포트를 찾지 못했습니다.");

                return;
            }

            setPhysicalPort((prev) => (prev && list.some((p) => p.path === prev) ? prev : list[0].path));
            setRelayPort((prev) =>
                prev && list.some((p) => p.path === prev) ? prev : (list[1]?.path ?? list[0].path),
            );

            appendStatus(`${list.length}개의 포트를 불러왔습니다.`);
        } catch (error) {
            appendStatus(`포트 목록 조회 실패: ${(error as Error).message}`);
        }
    };

    const connect = async (): Promise<void> => {
        if (!physicalPort || !relayPort) {
            appendStatus("물리 포트와 릴레이 포트를 모두 선택하세요.");

            return;
        }

        if (physicalPort === relayPort) {
            appendStatus("물리 포트와 릴레이 포트는 달라야 합니다.");

            return;
        }

        setBusy(true);
        try {
            const nextState = await window.api.connect({
                physicalPath: physicalPort,
                relayPath: relayPort,
                baudRate,
            });
            setConnectedState(nextState);
            appendStatus(`연결 성공: ${physicalPort} ↔ ${relayPort}`);
        } catch (error) {
            appendStatus(`연결 실패: ${(error as Error).message}`);
        } finally {
            setBusy(false);
        }
    };

    const disconnect = async (): Promise<void> => {
        setBusy(true);
        try {
            const nextState = await window.api.disconnect();
            setConnectedState(nextState);
            appendStatus("연결을 해제했습니다.");
        } catch (error) {
            appendStatus(`해제 실패: ${(error as Error).message}`);
        } finally {
            setBusy(false);
        }
    };

    const sendTx = async (): Promise<void> => {
        if (!txText) return;

        try {
            await window.api.sendTx({ text: txText, hexMode });
            setTxText("");
        } catch (error) {
            appendStatus(`TX 전송 실패: ${(error as Error).message}`);
        }
    };

    const clearLogs = (): void => {
        setLogs([]);
        appendStatus("출력 로그를 모두 지웠습니다.");
    };

    const copyLogLine = async (line: SnifferLog): Promise<void> => {
        await window.api.copyText(line.hex || "");
        appendStatus("선택한 로그를 복사했습니다.");
    };

    useEffect(() => {
        void refreshPorts();

        window.api
            .getState()
            .then((state) => setConnectedState(state))
            .catch(() => undefined);

        const disposeLog = window.api.onLog((payload) => {
            setLogs((prev) => [...prev, payload]);
        });

        const disposeState = window.api.onState((payload) => {
            setConnectedState(payload);
        });

        return () => {
            disposeLog();
            disposeState();
        };
    }, []);

    useEffect(() => {
        if (!autoScroll || !logsRef.current) return;
        logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }, [logs, autoScroll]);

    const portOptions = (
        <>
            {ports.length === 0 ? (
                <option value="">포트 없음</option>
            ) : (
                ports.map((port) => (
                    <option key={port.path} value={port.path}>
                        {port.path}
                        {port.manufacturer ? ` (${port.manufacturer})` : ""}
                    </option>
                ))
            )}
        </>
    );

    return (
        <div className="app-shell">
            <div className="toolbar">
                <span className="port-label">물리</span>
                <select
                    value={physicalPort}
                    onChange={(e) => setPhysicalPort(e.target.value)}
                    disabled={busy || connectedState.connected}
                >
                    {portOptions}
                </select>

                <span className="port-label">릴레이</span>
                <select
                    value={relayPort}
                    onChange={(e) => setRelayPort(e.target.value)}
                    disabled={busy || connectedState.connected}
                >
                    {portOptions}
                </select>

                <select
                    value={baudRate}
                    onChange={(e) => setBaudRate(Number(e.target.value))}
                    disabled={busy || connectedState.connected}
                >
                    {[300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((bps) => (
                        <option key={bps} value={bps}>
                            {bps.toLocaleString()} bps
                        </option>
                    ))}
                </select>

                <button type="button" onClick={() => void refreshPorts()} disabled={busy}>
                    새로고침
                </button>

                {!connectedState.connected ? (
                    <button
                        type="button"
                        onClick={() => void connect()}
                        disabled={busy || !physicalPort || !relayPort}
                        className="btn-connect"
                    >
                        연결
                    </button>
                ) : (
                    <button type="button" onClick={() => void disconnect()} disabled={busy} className="btn-disconnect">
                        해제
                    </button>
                )}

                <button type="button" onClick={clearLogs}>
                    지우기
                </button>

                <span className="status-info">
                    {connectedState.physicalPortPath ?? "-"} ↔ {connectedState.relayPortPath ?? "-"} |{" "}
                    {connectedState.connected ? "연결됨" : "대기"}
                </span>
            </div>

            <div className="tx-bar">
                <input
                    type="text"
                    value={txText}
                    style={{ flex: 1 }}
                    onChange={(e) => setTxText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void sendTx();
                    }}
                    placeholder={"물리 포트로 TX 전송 (Enter)"}
                    disabled={!connectedState.connected}
                />
                <label className="inline-label">
                    <input
                        type="checkbox"
                        checked={hexMode}
                        onChange={(e) => setHexMode(e.target.checked)}
                        disabled={!connectedState.connected}
                    />
                    HEX
                </label>
                <button type="button" onClick={() => void sendTx()} disabled={!connectedState.connected || !txText}>
                    전송
                </button>
                <label className="inline-label">
                    <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
                    자동스크롤
                </label>
            </div>

            <div className="console" ref={logsRef}>
                {logs.length === 0 ? (
                    <p className="empty">출력 대기 중...</p>
                ) : (
                    logs.map((line, index) => {
                        const lineText = `[${new Date(line.timestamp).toLocaleTimeString()}] ${line.direction} | ${line.hex ? line.hex : line.text}`;

                        return (
                            <div
                                key={`${line.timestamp}-${index}`}
                                className={`log-line direction-${line.direction.toLowerCase()}`}
                                tabIndex={0}
                                onDoubleClick={() => void copyLogLine(line)}
                                onKeyDown={(event) => {
                                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
                                        event.preventDefault();
                                        void copyLogLine(line);
                                    }
                                }}
                                title="더블클릭 또는 Ctrl+C로 복사"
                            >
                                {lineText}
                            </div>
                        );
                    })
                )}
            </div>

            <div className="status-bar">
                <span className="status-msg">{statusMessage}</span>
            </div>
        </div>
    );
}

export default App;
