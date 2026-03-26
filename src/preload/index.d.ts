import type { ElectronAPI } from "@electron-toolkit/preload";

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

interface SnifferApi {
    listPorts: () => Promise<PortInfo[]>;
    getState: () => Promise<SnifferState>;
    connect: (payload: ConnectPayload) => Promise<SnifferState>;
    disconnect: () => Promise<SnifferState>;
    sendTx: (payload: TxPayload) => Promise<boolean>;
    copyText: (text: string) => Promise<boolean>;
    onLog: (callback: (payload: SnifferLog) => void) => () => void;
    onState: (callback: (payload: SnifferState) => void) => () => void;
}

declare global {
    interface Window {
        electron: ElectronAPI;
        api: SnifferApi;
    }
}
