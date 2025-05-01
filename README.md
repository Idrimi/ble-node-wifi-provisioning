# BLE Wi-Fi Provisioning for Raspberry Pi Zero 2 W

This repository provides a turnkey solution for provisioning Wi-Fi credentials to a headless Raspberry Pi Zero 2 W over Bluetooth Low Energy (BLE), using **NetworkManager** and **Node.js**.

## Table of Contents
- [Overview](#overview)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Ble Provisioning Service](#ble-provisioning-service)
- [Testing the Provisioning Flow](#testing-the-provisioning-flow)
- [Troubleshooting](#troubleshooting)
- [Cleanup](#cleanup)
- [License](#license)

---

## Overview

When your Pi boots in **headless** mode (no display or keyboard), you can send it your Wi-Fi SSID and password over BLE. A **systemd** service ensures the BLE provisioning script runs automatically on startup and recovers from failures. The script uses `nmcli` to configure NetworkManager, eliminating manual edits to `wpa_supplicant.conf` or `dhcpcd.conf`.

## Repository Structure

```
├── install.sh
├── provision.js
└── ble-wifi-provision.service
```

- **install.sh**: Bash installer for Debian Bookworm Lite on Pi Zero 2 W
- **provision.js**: Node.js BLE service that advertises a GATT interface for Wi-Fi credentials
- **ble-wifi-provision.service**: systemd unit to manage the BLE provisioning script

## Prerequisites

- A **Raspberry Pi Zero 2 W** flashed with **Raspberry Pi OS Bookworm Lite**
- A second computer (laptop, desktop, or another Pi) with BLE support
- A BLE-capable mobile or desktop client (we use a Node.js script with [@abandonware/noble](https://github.com/abandonware/noble))

## Installation

1. **Copy** this repository to the Pi (e.g., via `git clone`).
2. **Make** the installer executable:
   ```bash
   chmod +x install.sh
   ```
3. **Run** the installer as root (or with sudo):
   ```bash
   sudo ./install.sh
   ```
4. **Reboot** the Pi:
   ```bash
   sudo reboot
   ```

The installer will:
- Update the system and set Wi-Fi country code
- Install and enable NetworkManager
- Install Node.js LTS and required dependencies
- Create and install the `provision.js` BLE provisioning script
- Register and start the `ble-wifi-provision` systemd service

## BLE Provisioning Service

Once the Pi reboots, it will advertise a BLE service named **WiFiProv**.

### GATT Characteristics

| UUID                                | Name    | Properties | Description                    |
| ----------------------------------- | ------- | ---------- | ------------------------------ |
| `12345678-1234-5678-1234-56789abcdef1` | SSID    | Write      | Write your network SSID here   |
| `12345678-1234-5678-1234-56789abcdef2` | PSK     | Write      | Write your network password    |
| `12345678-1234-5678-1234-56789abcdef3` | Status  | Read       | Read `waiting`, `configuring`, `ok`, or `failed` |

## Testing the Provisioning Flow

1. On a second machine, install dependencies:
   ```bash
   mkdir ble-test && cd ble-test
   npm init -y
   npm install @abandonware/noble
   ```
2. Create **client.js** with the following content:
   ```js
   const noble = require('@abandonware/noble');

   const SVC  = '12345678-1234-5678-1234-56789abcdef0';
   const SSID = '12345678-1234-5678-1234-56789abcdef1';
   const PSK  = '12345678-1234-5678-1234-56789abcdef2';
   const STA  = '12345678-1234-5678-1234-56789abcdef3';

   noble.on('stateChange', s => { if (s==='poweredOn') noble.startScanning([SVC], false); });

   noble.on('discover', async periph => {
     await noble.stopScanningAsync();
     await periph.connectAsync();
     const { characteristics } = await periph.discoverSomeServicesAndCharacteristicsAsync(
       [SVC], [SSID, PSK, STA]
     );
     const [cS, cP, cT] = characteristics;
     await cS.writeAsync(Buffer.from('YourSSID'), false);
     await cP.writeAsync(Buffer.from('YourPassword'), false);
     const status = (await cT.readAsync()).toString();
     console.log('Provision status:', status);
     process.exit(0);
   });
   ```
3. **Run** the client:
   ```bash
   node client.js
   ```
4. On the Pi, verify:
   ```bash
   nmcli connection show --active
   ip addr show wlan0
   ip route show default
   ping -c3 8.8.8.8
   ```

## Troubleshooting

- **BLE not advertising**: Ensure the `ble-wifi-provision` service is active:
  ```bash
  sudo systemctl status ble-wifi-provision
  ```
- **No Wi-Fi after provision**: Check NetworkManager logs:
  ```bash
  sudo journalctl -u NetworkManager -n50 --no-pager
  ```
- **Provisioning script logs**:
  ```bash
  sudo journalctl -u ble-wifi-provision -f
  ```
- **Country code issues**: Verify `country=CH` (or your code) via:
  ```bash
  grep country /etc/wpa_supplicant/wpa_supplicant.conf
  ```

## Cleanup

To disable BLE provisioning service and revert to default networking:

```bash
sudo systemctl disable --now ble-wifi-provision
sudo systemctl disable --now NetworkManager
sudo systemctl enable --now dhcpcd
```

Restore your original `/etc/wpa_supplicant/wpa_supplicant.conf` if needed.

## License

This project is released under the [MIT License](LICENSE).

