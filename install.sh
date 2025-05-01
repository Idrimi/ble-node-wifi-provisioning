#!/usr/bin/env bash
set -e

# install.sh — Automatische Einrichtung des BLE Wi-Fi-Provisioning mit NetworkManager
# für Raspberry Pi OS Bookworm Lite auf Raspberry Pi Zero 2 W

# 0. Als root ausführen
if [ "$(id -u)" -ne 0 ]; then
  echo "Bitte als root oder mit sudo ausführen."
  exit 1
fi

# 1. Non-interactive Mode
export DEBIAN_FRONTEND=noninteractive

# 2. System aktualisieren
apt-get update
apt-get full-upgrade -y

# 3. WLAN-Land setzen (für rfkill)
raspi-config nonint do_wifi_country CH || true

# 4. Abhängigkeiten installieren
apt-get install -y \
  network-manager \
  bluetooth \
  bluez \
  pi-bluetooth \
  libbluetooth-dev \
  libudev-dev \
  curl \
  build-essential \
  git

# 5. NetworkManager aktivieren, dhcpcd & wpa_supplicant@wlan0 deaktivieren (falls vorhanden)
echo "Deaktiviere dhcpcd.service (falls vorhanden)"
if systemctl list-unit-files | grep -q '^dhcpcd.service'; then
  systemctl disable --now dhcpcd.service || true
fi
echo "Deaktiviere wpa_supplicant@wlan0.service (falls vorhanden)"
systemctl disable --now wpa_supplicant@wlan0.service || true
echo "Aktiviere NetworkManager"
systemctl enable --now NetworkManager.service

# 6. Node.js (LTS) installieren
curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
apt-get install -y nodejs

# 7. Node native capabilities setzen
setcap cap_net_raw,cap_net_admin+eip "$(which node)"

# 8. Projektverzeichnis vorbereiten
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

if [ ! -f package.json ]; then
  npm init -y
fi
npm install @abandonware/bleno

# 9. provision.js mit NMCLI-basiertem Provisioning erzeugen
cat << 'EOF' > provision.js
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
EOF
