'use strict';

const bleno = require('@abandonware/bleno');
const { exec } = require('child_process');

const SERVICE_UUID     = '12345678-1234-5678-1234-56789abcdef0';
const CHAR_SSID_UUID   = '12345678-1234-5678-1234-56789abcdef1';
const CHAR_PSK_UUID    = '12345678-1234-5678-1234-56789abcdef2';
const CHAR_STAT_UUID   = '12345678-1234-5678-1234-56789abcdef3';

let creds = { ssid: null, psk: null };
const log = (...args) => console.log('[Provision]', ...args);
const errLog = (...args) => console.error('[Provision][ERROR]', ...args);

class StatusChar extends bleno.Characteristic {
  constructor() {
    super({ uuid: CHAR_STAT_UUID, properties: ['read'] });
    this._value = Buffer.from('waiting');
  }
  onReadRequest(offset, callback) {
    callback(this.RESULT_SUCCESS, this._value.slice(offset));
  }
  setStatus(msg) {
    this._value = Buffer.from(msg);
    log('Status', msg);
  }
}
const statusChar = new StatusChar();

class WriteChar extends bleno.Characteristic {
  constructor(uuid, key) {
    super({ uuid, properties: ['write'] });
    this.key = key;
  }
  async onWriteRequest(data, offset, withoutResponse, callback) {
    try {
      const value = data.toString('utf8').trim();
      if (!value) throw new Error('Empty value');
      creds[this.key] = value;
      log(`${this.key} received:`, value);
      callback(this.RESULT_SUCCESS);
      if (creds.ssid && creds.psk) await provisionWiFi();
    } catch (e) {
      errLog(`Write error for ${this.key}:`, e.message);
      callback(this.RESULT_UNLIKELY_ERROR);
      statusChar.setStatus('failed');
    }
  }
}

async function provisionWiFi() {
  statusChar.setStatus('configuring');
  log('Provisioning', creds);

  const conName = 'provisioned-wifi';

  await execPromise(`nmcli connection delete ${conName} || true`);
  await execPromise(
    `nmcli connection add type wifi ifname wlan0 con-name ${conName} ssid "${creds.ssid}" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "${creds.psk}" ipv4.method auto`
  );

  log('Bringing up connection');
  try {
    await execPromise(`nmcli connection up ${conName}`);
    log('Connection up');
    statusChar.setStatus('ok');
    bleno.stopAdvertising();
  } catch (e) {
    errLog('NMCLI up error:', e.message);
    statusChar.setStatus('failed');
  }
}

function execPromise(cmd) {
  return new Promise((res, rej) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) rej(new Error(stderr.trim())); else res(stdout.trim());
    });
  });
}

bleno.on('stateChange', state => {
  if (state === 'poweredOn') {
    bleno.startAdvertising('WiFiProv', [SERVICE_UUID], err => err ? errLog(err.message) : log('Advertising'));
  } else {
    bleno.stopAdvertising();
  }
});

bleno.on('advertisingStart', err => {
  if (err) return errLog('Adv start err:', err.message);
  bleno.setServices([new bleno.PrimaryService({
    uuid: SERVICE_UUID,
    characteristics: [
      new WriteChar(CHAR_SSID_UUID, 'ssid'),
      new WriteChar(CHAR_PSK_UUID, 'psk'),
      statusChar
    ]
  })]);
});

process.on('SIGINT', () => {
  bleno.stopAdvertising();
  process.exit();
});