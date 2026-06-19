import { DotPadSDK, DotPadScanner, DisplayMode, DataCodes } from './DotPadSDK-3_0_0.js';

const MATRIX_ROWS = 40;
const MATRIX_COLUMNS = 60;
const EXPECTED_HEX_LENGTH = 600;

function nowIso() {
  return new Date().toISOString();
}

function errorMessage(error) {
  if (!error) return 'Unknown error';
  return error.message || String(error);
}

export class DotPadConnectionManager {
  constructor(options = {}) {
    this.dotSdk = options.dotSdk || new DotPadSDK();
    this.dotScanner = options.dotScanner || new DotPadScanner();
    this.matrixToHex = options.matrixToHex;
    this.getCurrentMatrix = options.getCurrentMatrix || (() => []);
    this.renderMatrix = options.renderMatrix || (() => {});
    this.createTestPattern = options.createTestPattern || (() => null);
    this.onStateChange = options.onStateChange || (() => {});
    this.onDebugChange = options.onDebugChange || (() => {});
    this.onInputLog = options.onInputLog || (() => {});
    this.onPhysicalKey = options.onPhysicalKey || (() => {});
    this.announce = options.announce || (() => {});

    this.dotDevice = null;
    this.dotDeviceName = '';
    this.dotPadConnected = false;
    this.mockMode = false;
    this.connectionState = 'disconnected';
    this.connectionReason = 'startup';

    this.lastSendStatus = 'idle';
    this.lastSendReason = '';
    this.lastSendHexLength = 0;
    this.lastSendMatrixDotCount = 0;
    this.lastSendAt = '';
    this.lastSendError = '';
    this.readyResendTimers = [];   // 연결 후 그래픽 활성 지연 대비 재전송 재시도

    this.dotSdk.setCallBack(
      (device, code, data) => this.handleSdkMessage(device, code, data),
      (device, key, rawCode) => this.handleSdkKey(device, key, rawCode),
    );

    this.setDisconnectedState('startup');
  }

  async connect() {
    if (this.mockMode) {
      this.onInputLog('Connect skipped → Mock Mode is active / Mock Mode 사용 중');
      return this.getDebugStatus();
    }
    if (this.dotPadConnected && this.dotDevice) return this.getDebugStatus();

    if (!navigator.bluetooth) {
      const message = 'Web Bluetooth unavailable. Use desktop Chrome or Edge over HTTPS. / Web Bluetooth를 지원하지 않습니다.';
      this.connectionState = 'unsupported';
      this.connectionReason = 'web-bluetooth-unavailable';
      this.emitState(message, false);
      this.lastSendError = message;
      this.refreshDebug();
      this.announce(message, true);
      return this.getDebugStatus();
    }

    try {
      this.connectionState = 'searching';
      this.connectionReason = 'ble-scan';
      this.emitState('Waiting for DotPad connection / DotPad 검색 중…', false);
      this.refreshDebug();

      const selectedDevice = await this.dotScanner.startBleScan();
      if (!selectedDevice) {
        this.setDisconnectedState('device-selection-cancelled');
        this.announce('No DotPad selected. / 연결할 DotPad를 선택하지 않았습니다.');
        return this.getDebugStatus();
      }

      this.connectionState = 'connecting';
      this.connectionReason = 'ble-connect';
      this.emitState('Waiting for DotPad connection / DotPad 연결 중…', false);
      this.refreshDebug();

      const dev = await this.dotSdk.connectBleDevice(selectedDevice);
      if (!dev) {
        this.setDisconnectedState('connect-returned-null');
        this.lastSendError = 'connectBleDevice() returned no device.';
        this.refreshDebug();
        this.announce('DotPad connection failed. Check power and Bluetooth. / 연결에 실패했습니다.', true);
        return this.getDebugStatus();
      }

      // SDK 3.0 can return a usable DotDevice before DataCodes.Connected arrives.
      // Treat the returned device as a successful connection so sends never fail silently.
      if (!this.dotPadConnected || this.dotDevice !== dev) {
        this.setConnectedState(dev, 'connect-return-fallback');
        this.announce('DotPad Connected. The tactile frame is ready. / DotPad 연결 성공.', true);
        await this.sendMatrix(this.getCurrentMatrix(), 'connect-success');
        // 보드정보 핸드셰이크가 늦어 그래픽이 잠시 비활성일 수 있어, 수 초간 재전송 재시도.
        this.scheduleReadyResends();
      }

      return this.getDebugStatus();
    } catch (error) {
      this.setDisconnectedState('connect-error');
      this.lastSendError = errorMessage(error);
      this.refreshDebug();
      this.onInputLog(`DotPad connection failed → ${this.lastSendError}`);
      this.announce('DotPad connection failed. Try again. / 연결 중 문제가 발생했습니다.', true);
      console.error('[DotPad] connect failed:', error);
      return this.getDebugStatus();
    }
  }

  async disconnect() {
    const wasMock = this.mockMode;
    const device = this.dotDevice;

    this.mockMode = false;
    this.dotDevice = null;
    this.dotPadConnected = false;

    if (!wasMock && device) {
      try {
        await this.dotSdk.disconnect(device);
      } catch (error) {
        console.warn('[DotPad] disconnect warning:', error);
      }
    }

    this.setDisconnectedState(wasMock ? 'mock-disabled' : 'manual-disconnect');
    this.onInputLog(wasMock
      ? 'Mock Mode disabled / Mock Mode 종료'
      : 'Disconnect DotPad → DotPad Disconnected / 연결 해제');
    this.announce(wasMock
      ? 'Mock Mode disabled. / Mock Mode를 종료했습니다.'
      : 'DotPad Disconnected. / DotPad 연결이 해제되었습니다.');
    return this.getDebugStatus();
  }

  async sendMatrix(matrix, reason = 'unspecified') {
    this.lastSendReason = reason;
    this.lastSendAt = nowIso();
    this.lastSendError = '';
    this.lastSendHexLength = 0;
    this.lastSendMatrixDotCount = this.countDots(matrix);

    try {
      this.validateMatrix(matrix);
      const hex = this.matrixToHex(matrix);
      this.lastSendHexLength = typeof hex === 'string' ? hex.length : 0;

      if (this.lastSendHexLength !== EXPECTED_HEX_LENGTH) {
        throw new Error(`Expected 600 hex characters, received ${this.lastSendHexLength}.`);
      }

      this.renderMatrix(matrix, { reason });

      if (this.mockMode) {
        this.lastSendStatus = 'mock-sent';
        this.refreshDebug();
        return {
          ok: true,
          mode: 'mock',
          message: `Mock DotPad frame sent · 600hex · dots: ${this.lastSendMatrixDotCount}`,
          ...this.getDebugStatus(),
        };
      }

      if (!this.dotPadConnected || !this.dotDevice) {
        this.lastSendStatus = 'skipped';
        this.lastSendError = 'DotPad not connected';
        this.refreshDebug();
        return {
          ok: false,
          skipped: true,
          message: 'Skipped: DotPad not connected',
          ...this.getDebugStatus(),
        };
      }

      this.dotSdk.displayGraphicData(hex, this.dotDevice, DisplayMode.GraphicMode);
      this.lastSendStatus = 'sent';
      this.refreshDebug();
      return {
        ok: true,
        mode: 'hardware',
        message: `Frame sent to DotPad · 600hex · dots: ${this.lastSendMatrixDotCount}`,
        ...this.getDebugStatus(),
      };
    } catch (error) {
      this.lastSendStatus = 'failed';
      this.lastSendError = errorMessage(error);
      this.refreshDebug();
      console.error(`[DotPad] send failed (${reason}):`, error);
      return {
        ok: false,
        message: `DotPad send failed: ${this.lastSendError}`,
        ...this.getDebugStatus(),
      };
    }
  }

  async sendTestPattern(patternType) {
    const pattern = this.createTestPattern(patternType);
    if (!pattern || !Array.isArray(pattern.frames) || pattern.frames.length === 0) {
      const result = {
        ok: false,
        message: `Unknown test pattern: ${patternType}`,
      };
      this.lastSendStatus = 'failed';
      this.lastSendReason = 'test-pattern';
      this.lastSendError = result.message;
      this.lastSendAt = nowIso();
      this.refreshDebug();
      return result;
    }

    let result = null;
    for (let index = 0; index < pattern.frames.length; index += 1) {
      const reason = pattern.frames.length > 1
        ? `test-pattern:${patternType}:${index + 1}`
        : 'test-pattern';
      result = await this.sendMatrix(pattern.frames[index], reason);
      if (!result.ok && !result.skipped) break;
      if (index < pattern.frames.length - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, pattern.delayMs || 220));
      }
    }

    const label = pattern.label || patternType;
    this.onInputLog(`${label} → ${result?.message || 'Test pattern failed'}`);
    if (result?.ok) {
      this.announce(`Test pattern sent: ${label}. / 테스트 패턴 전송 완료.`, true);
    } else if (result?.skipped) {
      this.announce('Waiting for DotPad connection. Enable Mock Mode or connect a device. / DotPad 연결을 기다리는 중입니다.', true);
    } else {
      this.announce(result?.message || 'Test pattern failed.', true);
    }
    return result;
  }

  setConnectedState(device, reason = 'connected') {
    this.dotDevice = device || this.dotDevice;
    this.dotPadConnected = true;
    this.mockMode = reason === 'mock-mode';
    this.connectionState = this.mockMode ? 'mock' : 'connected';
    this.connectionReason = reason;

    const deviceLabel = this.dotDeviceName ? ` · ${this.dotDeviceName}` : '';
    const text = this.mockMode
      ? 'Mock Mode · DotPad Ready / 모의 기기 준비'
      : `DotPad Connected${deviceLabel} / 연결됨`;
    this.emitState(text, true);
    this.refreshDebug();
    return this.getDebugStatus();
  }

  scheduleReadyResends() {
    this.clearReadyResends();
    // 0.5~5s 동안 몇 번 재전송 — 그래픽 활성(#w)이 늦게 켜지면 이때 실제로 출력됨.
    [500, 1200, 2500, 4500].forEach((delay) => {
      this.readyResendTimers.push(setTimeout(() => {
        if (this.dotPadConnected && this.dotDevice && !this.mockMode) {
          this.sendMatrix(this.getCurrentMatrix(), 'post-connect-retry');
        }
      }, delay));
    });
  }

  clearReadyResends() {
    (this.readyResendTimers || []).forEach((t) => clearTimeout(t));
    this.readyResendTimers = [];
  }

  setDisconnectedState(reason = 'disconnected') {
    this.clearReadyResends();
    this.dotDevice = null;
    this.dotDeviceName = '';
    this.dotPadConnected = false;
    this.connectionState = 'disconnected';
    this.connectionReason = reason;
    this.emitState('DotPad Disconnected / 미연결', false);
    this.refreshDebug();
    return this.getDebugStatus();
  }

  setMockMode(enabled) {
    if (enabled) {
      const oldDevice = this.dotDevice;
      if (oldDevice && !this.mockMode) {
        try { this.dotSdk.disconnect(oldDevice); } catch (error) { console.warn('[DotPad] mock switch:', error); }
      }
      this.dotDevice = null;
      this.mockMode = true;
      this.setConnectedState(null, 'mock-mode');
      this.onInputLog('Mock Mode enabled → preview and key mapping ready / Mock Mode 시작');
      this.announce('Mock Mode enabled. DotPad sends will be simulated. / Mock Mode를 시작합니다.', true);
      return this.sendMatrix(this.getCurrentMatrix(), 'mock-mode-start');
    }
    return this.disconnect();
  }

  getDebugStatus() {
    return {
      connectionState: this.connectionState,
      connectionReason: this.connectionReason,
      connected: this.dotPadConnected,
      mockMode: this.mockMode,
      deviceName: this.dotDeviceName,
      hasDevice: !!this.dotDevice,
      lastSendStatus: this.lastSendStatus,
      lastSendReason: this.lastSendReason,
      lastSendHexLength: this.lastSendHexLength,
      lastSendMatrixDotCount: this.lastSendMatrixDotCount,
      lastSendAt: this.lastSendAt,
      lastSendError: this.lastSendError,
    };
  }

  handleSdkMessage(device, code, data) {
    if (code === DataCodes.DeviceName) {
      this.dotDeviceName = data || '';
      if (this.dotPadConnected && !this.mockMode) this.setConnectedState(device, 'device-name');
      return;
    }

    if (code === DataCodes.Connected) {
      const alreadyConnected = this.dotPadConnected && this.dotDevice === device && !this.mockMode;
      this.setConnectedState(device, 'sdk-connected');
      if (!alreadyConnected) {
        this.onInputLog('DotPad SDK callback → Connected');
        this.announce('DotPad Connected. / DotPad 연결 성공.', true);
      }
      // The callback means board information and graphic dimensions are ready.
      // Resend even when connect() already used its return-value fallback.
      this.sendMatrix(this.getCurrentMatrix(), 'sdk-connected');
      return;
    }

    if (code === DataCodes.Disconnected) {
      if (this.mockMode) return;
      this.setDisconnectedState('sdk-disconnected');
      this.onInputLog('DotPad SDK callback → Disconnected');
      this.announce('DotPad Disconnected. / DotPad 연결이 해제되었습니다.');
      return;
    }

    if (code === DataCodes.ConnectedFail || code === DataCodes.CommandError) {
      this.lastSendError = data || code;
      this.connectionReason = code;
      this.refreshDebug();
      this.onInputLog(`DotPad SDK ${code} → ${this.lastSendError}`);
      return;
    }

    if (code === DataCodes.ResponseDisplayLineNonAck) {
      this.lastSendStatus = 'failed';
      this.lastSendError = data || 'DotPad display command was not acknowledged.';
      this.lastSendAt = nowIso();
      this.refreshDebug();
      this.onInputLog(`DotPad send failed → ${this.lastSendError}`);
    }
  }

  handleSdkKey(device, key, rawCode) {
    this.onInputLog(`Physical key received / 물리키 수신: ${key}${rawCode ? ` (${rawCode})` : ''}`);
    this.onPhysicalKey(device, key, rawCode);
  }

  validateMatrix(matrix) {
    if (!Array.isArray(matrix) || matrix.length !== MATRIX_ROWS) {
      throw new Error(`DotPad matrix must have 40 rows. Received: ${Array.isArray(matrix) ? matrix.length : 'not an array'}.`);
    }
    matrix.forEach((row, index) => {
      if (!Array.isArray(row) || row.length !== MATRIX_COLUMNS) {
        throw new Error(`DotPad matrix row ${index} must have 60 columns. Received: ${Array.isArray(row) ? row.length : 'not an array'}.`);
      }
    });
  }

  countDots(matrix) {
    if (!Array.isArray(matrix)) return 0;
    return matrix.reduce((total, row) => {
      if (!Array.isArray(row)) return total;
      return total + row.reduce((count, value) => count + (value ? 1 : 0), 0);
    }, 0);
  }

  emitState(text, connected) {
    this.onStateChange(text, connected, this.getDebugStatus());
  }

  refreshDebug() {
    this.onDebugChange(this.getDebugStatus());
  }
}
