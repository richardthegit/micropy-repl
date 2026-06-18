'use strict';

import { AnsiUp } from './libs/ansi_up.js';
const ansiUp = new AnsiUp();

// REPL controll characters.
const soh = '\x01'; // Start of Header - enter raw REPL mode.
const stx = '\x02'; // Start of text - exit raw REPL.
const etx = '\x03'; // End of text - keyboard interrupt.
const eot = '\x04'; // End of transmission - reboot.
const enc = new TextEncoder();

export class Repl {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
  }

  /**
   * Run the passed python on the device.
   */
  async python(code) {
    await this.writer.write(enc.encode(`${code}${eot}`));
  }

  /**
   * Connect to the device, reset it, copy its output stream to the console element,
   * and return the writer.
   */
  async connectDevice() {
    try {
      // Prompts user to select the ESP32 from a browser popup
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 115200 });

      this.reader = this.port.readable.getReader();
      this.readDevice();

      // Put the ESP32 into Raw REPL mode and reboot it.
      this.writer = this.port.writable.getWriter();
      await this.writer.write(enc.encode(`${etx}`));
      await new Promise(resolve => setTimeout(resolve, 100));
      await this.writer.write(enc.encode(`${soh}${eot}`));
      await this.python(`
from rb.core.store import store
print('Current saved settings:')
store.dump()`);

      return this.writer;
    } catch (error) {
      console.error('Connection failed:', error);
      return null;
    }
  }

  /**
   * Reboot and disconnect the device.
   */
  async disconnectDevice() {
    await this.writer.write(enc.encode(`import machine;machine.reset()${eot}`));
    this.writer.releaseLock();
    await this.reader.cancel();
    this.reader.releaseLock();
    await this.port.close();
  }

  /**
   * Read from the device forever.
   */
  async readDevice() {
    const outputArea = document.getElementById('serial-console');
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { value, done } = await this.reader.read();

        if (done) {
          outputArea.innerHTML += '\n--- Connection Closed ---';
          break;
        }

        outputArea.innerHTML += ansiUp.ansi_to_html(decoder.decode(value));
      }
    } catch (error) {
      outputArea.innerHTML += `\nSerial Error: ${error.message}\n`;
    }
  }

  /**
   * Set the wifi credentials on the device.
   */
  async setWifiCreds(hostname, ssid, password) {
    await this.python(`
from rb.core.wifi import configure_wifi
configure_wifi('${hostname}', '${ssid}', '${password}')
print('Wifi configured')`);
  }

  /**
   * Set the MQTT credentials on the device.
   */
  async setMQTTCreds(broker, username, password) {
    await this.python(`
from rb.mqtt.manager import set_mqtt_creds
set_mqtt_creds('${broker}', '${username}', '${password}')
print('MQTT configured')`);
  }

  async toggleBigClock() {
    await this.python(`
from clock import toggle_big_clock
toggle_big_clock()`);
  }

  async setTimezone(name, offset) {
    await this.python(`
from rb.core.tz import set_tz
set_tz('${name}', ${offset})
print('Timezone configured to ${name}')`);
  }
}
