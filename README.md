# BLE Wi-Fi Provisioning for Raspberry Pi Zero 2 W (TypeScript)

This repo provides a BLE-based Wi-Fi provisioning service, implemented in **TypeScript** and using **NetworkManager**.

## Setup

```bash
chmod +x install.sh
sudo ./install.sh
sudo reboot
```

After reboot, the Pi advertises **WiFiProv** and accepts SSID/PSK via BLE.

## Files

- **install.sh** – installer script
- **src/provision.ts** – BLE provisioning logic
- **tsconfig.json** – TS compiler config
- **package.json** – Node project metadata
- **ble-wifi-provision.service** – systemd unit
