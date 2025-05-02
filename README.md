# BLE Wi-Fi Provisioning for Raspberry Pi Zero 2 W

> **🫘 Everything that can be written in JavaScript, will be written in JavaScript.**

> **🧠 Even though you can and maybe want to use this Repo, you shouldn't. Are you stupid? Use phython, C or go.**

This repository provides a complete solution for provisioning Wi‑Fi credentials to a headless Raspberry Pi Zero 2 W over Bluetooth Low Energy (BLE) using Node.js (TypeScript) and NetworkManager.

## Overview

When operating in headless mode, configuring Wi‑Fi on a Pi typically requires physical access to network configuration files or another SSH connection over Ethernet. This project allows you to send the SSID and password over BLE and apply them automatically using NetworkManager.

## Repository Structure

```
├── install.sh                  # Installer script
├── README.md                   # Project documentation
├── package.json                # Node.js project configuration
├── tsconfig.json               # TypeScript compiler configuration
├── ble-wifi-provision.service  # systemd unit for the provisioning service
└── src
    └── provision.ts            # BLE provisioning logic (TypeScript)
```

## Prerequisites

- A Raspberry Pi Zero 2 W with Raspberry Pi OS Bookworm Lite
- Bluetooth Low Energy support (built-in on Pi Zero 2 W)
- Internet connectivity for package installation
- A second BLE-capable device (e.g., laptop, smartphone) for testing
- Basic familiarity with the Linux command line and systemd

## Installation

1. Copy or clone this repository onto your Pi:
   ```bash
   git clone https://github.com/Idrimi/ble-node-wifi-provisioning.git
   cd <repository-directory>
   ```
2. Make the installer executable and run it as root:
   ```bash
   chmod +x install.sh
   sudo ./install.sh
   ```
3. Reboot the Pi:
   ```bash
   sudo reboot
   ```

The installer will:
- Update and upgrade system packages
- Install and enable NetworkManager
- Install Node.js and TypeScript tooling
- Compile the BLE provisioning script
- Install and enable the systemd service

## Usage

After reboot, the Pi advertises a BLE service named **WiFiProv**. To provision Wi‑Fi:

1. Connect using a BLE client (mobile app or Node.js script)
2. Write the desired SSID to the first characteristic
3. Write the password (PSK) to the second characteristic
4. Read the status characteristic until it reports `ok` (success) or `failed`

The script then uses `nmcli` to configure NetworkManager:
- Deletes any existing `provisioned-wifi` connection
- Adds a new connection with the provided SSID and PSK
- Brings the connection up automatically

## BLE GATT Characteristics

| UUID                                | Name   | Properties | Description                          |
|-------------------------------------|--------|------------|--------------------------------------|
| `...abcdef1`                        | SSID   | Write      | Set Wi‑Fi network SSID               |
| `...abcdef2`                        | PSK    | Write      | Set Wi‑Fi network password (PSK)     |
| `...abcdef3`                        | Status | Read       | Read provisioning status (`waiting`, `configuring`, `ok`, `failed`)

*(UUIDs are defined in `src/provision.ts`.)*

## Testing

A sample Node.js client is provided in this repo (or see `sample-client.js`):

```bash
# On a separate machine
npm install @abandonware/noble
node sample-client.js
```

Verify the new connection on the Pi:

```bash
nmcli connection show --active
ip addr show wlan0
ping -c3 8.8.8.8
```

## Troubleshooting

- **Service status**: `sudo systemctl status ble-wifi-provision`
- **Service logs**: `sudo journalctl -u ble-wifi-provision -f`
- **NetworkManager logs**: `sudo journalctl -u NetworkManager -f`
- **BLE issues**: Ensure no other process is blocking HCI (`sudo hciconfig hci0 up`).

## Cleanup

To disable BLE provisioning and revert to default networking:

```bash
sudo systemctl disable --now ble-wifi-provision
sudo systemctl disable --now NetworkManager
sudo systemctl enable --now dhcpcd
```

Restore or edit `/etc/wpa_supplicant/wpa_supplicant.conf` as needed.

## License

This project is released under the MIT License.
