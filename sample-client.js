const noble = require('@abandonware/noble');

// UUIDs must match those in src/provision.ts
const SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const SSID_UUID    = '12345678-1234-5678-1234-56789abcdef1';
const PSK_UUID     = '12345678-1234-5678-1234-56789abcdef2';
const STAT_UUID    = '12345678-1234-5678-1234-56789abcdef3';

async function main() {
  noble.on('stateChange', async state => {
    if (state === 'poweredOn') {
      console.log('Scanning for WiFiProv service...');
      await noble.startScanningAsync([SERVICE_UUID], false);
    } else {
      noble.stopScanning();
    }
  });

  noble.on('discover', async peripheral => {
    console.log('Discovered peripheral:', peripheral.address);
    await noble.stopScanningAsync();

    try {
      await peripheral.connectAsync();
      console.log('Connected to', peripheral.address);

      const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [SERVICE_UUID], [SSID_UUID, PSK_UUID, STAT_UUID]
      );

      const [ssidChar, pskChar, statChar] = characteristics;

      // Set your network credentials here
      const ssid = 'YourSSID';
      const password = 'YourPassword';

      console.log('Writing SSID...');
      await ssidChar.writeAsync(Buffer.from(ssid), false);

      console.log('Writing PSK...');
      await pskChar.writeAsync(Buffer.from(password), false);

      console.log('Reading status...');
      const statusBuffer = await statChar.readAsync();
      console.log('Provisioning status:', statusBuffer.toString());

      await peripheral.disconnectAsync();
      console.log('Disconnected.');
    } catch (error) {
      console.error('Error during provisioning:', error);
    } finally {
      process.exit(0);
    }
  });
}

main();
