#!/usr/bin/env bash
set -e

# install.sh – Automated setup for BLE Wi-Fi Provisioning using TypeScript & NetworkManager
# Target: Raspberry Pi OS Bookworm Lite on Raspberry Pi Zero 2 W

# 0. must be root
if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root or via sudo"
  exit 1
fi

# 1. Non-interactive apt
export DEBIAN_FRONTEND=noninteractive

# 2. System update
apt-get update
apt-get full-upgrade -y

# 3. Set Wi-Fi country (for rfkill)
raspi-config nonint do_wifi_country CH || true

# 4. Install core dependencies
apt-get install -y \
  network-manager \
  bluetooth pi-bluetooth bluez \
  libbluetooth-dev libudev-dev \
  curl git build-essential

# 5. Disable dhcpcd & interface wpa_supplicant, enable NM
if systemctl list-unit-files | grep -q '^dhcpcd.service'; then
  systemctl disable --now dhcpcd.service || true
fi
systemctl disable --now wpa_supplicant@wlan0.service || true
systemctl enable --now NetworkManager.service

# 6. Install Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
apt-get install -y nodejs

# 7. Grant net capabilities to Node
setcap cap_net_raw,cap_net_admin+eip "$(which node)"

# 8. Initialize project & build
cd "$(dirname "$0")"
npm install
npm run build

# 9. Enable systemd service
cp ble-wifi-provision.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ble-wifi-provision.service

echo "Setup complete. Please reboot."
