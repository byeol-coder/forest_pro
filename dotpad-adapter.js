/*
  Dot Pad SDK + DTMS/DTM Adapter
  --------------------------------
  Graphic standard for this MVP:
  - 1 page graphic = 60 x 40 pins = 2,400 binary dots
  - 2 x 4 pin block = 1 eight-dot braille cell byte
  - 60 x 40 pins = 30 x 10 cells = 300 bytes
  - 300 bytes = 600 uppercase hex characters

  Eight-dot braille bit order per 2 x 4 block:
  bit 0: dot 1, left column row 1
  bit 1: dot 2, left column row 2
  bit 2: dot 3, left column row 3
  bit 3: dot 4, right column row 1
  bit 4: dot 5, right column row 2
  bit 5: dot 6, right column row 3
  bit 6: dot 7, left column row 4
  bit 7: dot 8, right column row 4
*/
(function () {
  const STANDARD = Object.freeze({
    width: 60,
    height: 40,
    cellWidth: 2,
    cellHeight: 4,
    cellsX: 30,
    cellsY: 10,
    byteLength: 300,
    hexLength: 600,
    bitOrder: [
      { x: 0, y: 0, bit: 0, dot: 1 },
      { x: 0, y: 1, bit: 1, dot: 2 },
      { x: 0, y: 2, bit: 2, dot: 3 },
      { x: 1, y: 0, bit: 3, dot: 4 },
      { x: 1, y: 1, bit: 4, dot: 5 },
      { x: 1, y: 2, bit: 5, dot: 6 },
      { x: 0, y: 3, bit: 6, dot: 7 },
      { x: 1, y: 3, bit: 7, dot: 8 }
    ]
  });

  const bridge = {
    mode: 'simulation',
    connected: false,
    standard: STANDARD,
    lastPage: null,

    async connect() {
      // TODO: Initialize DotPadSDK-1.0.0.js here when hardware testing is available.
      // Example placeholder:
      // this.device = await DotPadSDK.connect();
      // this.connected = true;
      // this.mode = 'hardware';
      console.info('[DotPadBridge] Simulation mode. Hardware SDK is not connected yet.');
      return { connected: this.connected, mode: this.mode, standard: this.standard };
    },

    mapKeyToAction(keyCode, ACTIONS) {
      const hardwareMap = {
        LEFT_TRIANGLE: ACTIONS.PREVIOUS,
        RIGHT_TRIANGLE: ACTIONS.NEXT,
        FUNCTION_1: ACTIONS.READ_CURRENT,
        FUNCTION_2: ACTIONS.INTERACT_OR_NEXT,
        FUNCTION_3: ACTIONS.READ_MISSION,
        FUNCTION_4: ACTIONS.READ_AROUND,
        FUNCTION_5: ACTIONS.HELP_OR_MENU
      };
      return hardwareMap[keyCode] || null;
    },

    toBinaryMatrix(matrix) {
      return matrix.map(row => row.map(value => value > 0 ? 1 : 0));
    },

    assertMatrix(matrix) {
      if (!Array.isArray(matrix) || matrix.length !== STANDARD.height) {
        throw new Error('Dot Pad graphic matrix must have exactly 40 rows.');
      }
      matrix.forEach((row, index) => {
        if (!Array.isArray(row) || row.length !== STANDARD.width) {
          throw new Error(`Dot Pad graphic row ${index} must have exactly 60 columns.`);
        }
      });
    },

    encodeGraphicToBytes(matrix) {
      this.assertMatrix(matrix);
      const binaryMatrix = this.toBinaryMatrix(matrix);
      const bytes = [];

      for (let cellY = 0; cellY < STANDARD.cellsY; cellY += 1) {
        for (let cellX = 0; cellX < STANDARD.cellsX; cellX += 1) {
          const baseX = cellX * STANDARD.cellWidth;
          const baseY = cellY * STANDARD.cellHeight;
          let byte = 0;

          STANDARD.bitOrder.forEach(({ x, y, bit }) => {
            if (binaryMatrix[baseY + y][baseX + x]) {
              byte |= (1 << bit);
            }
          });

          bytes.push(byte);
        }
      }

      if (bytes.length !== STANDARD.byteLength) {
        throw new Error(`Encoded graphic must be 300 bytes. Current: ${bytes.length}`);
      }

      return bytes;
    },

    encodeGraphicToHex(matrix) {
      return this.encodeGraphicToBytes(matrix)
        .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
        .join('');
    },

    createDtmsPage({ page = 1, title = '', matrix, textPlain = '' }) {
      const data = this.encodeGraphicToHex(matrix);
      const dtmsPage = {
        page,
        title,
        text: {
          plain: textPlain
        },
        items: [
          {
            type: 'graphic',
            graphic: {
              width: STANDARD.width,
              height: STANDARD.height,
              cell: '2x4',
              cells: {
                columns: STANDARD.cellsX,
                rows: STANDARD.cellsY
              },
              byteLength: STANDARD.byteLength,
              hexLength: STANDARD.hexLength,
              bitOrder: '8-dot-braille:1,2,3,4,5,6,7,8',
              data
            }
          }
        ]
      };

      this.lastPage = dtmsPage;
      return dtmsPage;
    },

    createDtmsDocument(pages = []) {
      return {
        version: '0.1-mvp',
        format: 'dtms-compatible',
        device: 'Dot Pad 60x40',
        graphicStandard: STANDARD,
        pages
      };
    },

    sendGraphic(matrix, meta = {}) {
      const page = this.createDtmsPage({
        page: meta.page || 1,
        title: meta.title || 'Untitled tactile graphic',
        matrix,
        textPlain: meta.textPlain || ''
      });

      if (!this.connected) {
        console.log('[DotPadBridge] DTMS-compatible page in simulation:', page);
        return { ok: true, mode: this.mode, page };
      }

      // TODO: Send page.items[0].graphic.data to actual Dot Pad SDK.
      // Example placeholder:
      // return this.device.displayGraphicHex(page.items[0].graphic.data, { width: 60, height: 40 });
      return { ok: true, mode: this.mode, page };
    }
  };

  window.DotPadBridge = bridge;
})();
