import bleno from '@abandonware/bleno';
import { exec } from 'child_process';

const SERVICE_UUID     = '12345678-1234-5678-1234-56789abcdef0';
const CHAR_SSID_UUID   = '12345678-1234-5678-1234-56789abcdef1';
const CHAR_PSK_UUID    = '12345678-1234-5678-1234-56789abcdef2';
const CHAR_STAT_UUID   = '12345678-1234-5678-1234-56789abcdef3';

interface Creds { ssid: string | null; psk: string | null; }
let creds: Creds = { ssid: null, psk: null };

const log = (...args: unknown[]) => console.log('[Provision]', ...args);
const errLog = (...args: unknown[]) => console.error('[Provision][ERROR]', ...args);

class StatusChar extends bleno.Characteristic {
  private _value = Buffer.from('waiting');
  constructor() { super({ uuid: CHAR_STAT_UUID, properties: ['read'] }); }
  // @ts-ignore
  onReadRequest(offset: number, callback: bleno.CharacteristicReadCallback) {
    callback(this.RESULT_SUCCESS, this._value.slice(offset));
  }
  setStatus(msg: string) {
    this._value = Buffer.from(msg);
    log('Status', msg);
  }
}

class WriteChar extends bleno.Characteristic {
  constructor(uuid: string, private key: keyof Creds) {
    super({ uuid, properties: ['write'] });
  }
  // @ts-ignore
  onWriteRequest(data: Buffer, offset: number, withoutResponse: boolean, callback: bleno.CharacteristicWriteCallback) {
    try {
      const value = data.toString('utf8').trim();
      if (!value) throw new Error('Empty value');
      creds[this.key] = value;
      log(this.key, 'received:', value);
      callback(this.RESULT_SUCCESS);
      if (creds.ssid && creds.psk) provisionWiFi();
    } catch (e) {
      errLog('Write error for', this.key, e);
      callback(this.RESULT_UNLIKELY_ERROR);
      statusChar.setStatus('failed');
    }
  }
}

async function execAsync(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) =>
      err ? reject(new Error(stderr.trim())) : resolve(stdout.trim())
    );
  });
}

const statusChar = new StatusChar();

async function provisionWiFi() {
  statusChar.setStatus('configuring');
  log('Provisioning', creds);
  const conName = 'provisioned-wifi';

  try {
    await execAsync(`nmcli connection delete ${conName} || true`);
    await execAsync(
      `nmcli connection add type wifi ifname wlan0 con-name ${conName} ssid "${creds.ssid}" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "${creds.psk}" ipv4.method auto`
    );
    await execAsync(`nmcli connection up ${conName}`);
    log('Connection up');
    statusChar.setStatus('ok');
    bleno.stopAdvertising();
  } catch (e) {
    errLog('Provision error:', e);
    statusChar.setStatus('failed');
  }
}

bleno.on('stateChange', state => {
  if (state === 'poweredOn') {
    bleno.startAdvertising('WiFiProv', [SERVICE_UUID], err => {
      if (err) return errLog('Advertising error', err);
      bleno.setServices([ new bleno.PrimaryService({
        uuid: SERVICE_UUID,
        characteristics: [
          new WriteChar(CHAR_SSID_UUID, 'ssid'),
          new WriteChar(CHAR_PSK_UUID, 'psk'),
          statusChar
        ]
      }) ]);
    });
  } else {
    bleno.stopAdvertising();
  }
});

process.on('SIGINT', () => {
  bleno.stopAdvertising();
  process.exit();
});
