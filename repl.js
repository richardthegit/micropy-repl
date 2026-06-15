// REPL controll characters.
const soh = '\x01'; // Start of Header - enter raw REPL mode.
const stx = '\x02'; // Start of text - exit raw REPL.
const etx = '\x03'; // End of text - keyboard interrupt.
const eot = '\x04'; // End of transmission - end of line.

var port, reader, writer;
const enc = new TextEncoder();

/**
 * Run the passed python on the device.
 */
const python = async (code) => {
  await writer.write(enc.encode(`${code}${eot}`));
}

/**
 * Connect to the device, reset it, copy its output stream to the console element,
 * and return the writer.
 */
const connectDevice = async () => {
  try {
    // Prompts user to select the ESP32 from a browser popup
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });          

    reader = port.readable.getReader()
    readDevice(reader);

    // Put the ESP32 into Raw REPL mode and reboot it.
    writer = port.writable.getWriter();
    await writer.write(enc.encode(`${etx}`));
    await new Promise(resolve => setTimeout(resolve, 50)); 
    await writer.write(enc.encode(`${soh}${eot}`));
    await python(`
from rb.core.store import store
print('Current saved settings:')
store.dump()`);

    return writer;

  } catch (error) {
    console.error('Connection failed:', error);
    return null;
  }
};


/**
 * Reboot and disconnect the device.
 */
const disconnectDevice = async () => {
  await writer.write(enc.encode(`import machine;machine.reset()${eot}`));
  writer.releaseLock();
  await reader.cancel();
  reader.releaseLock();
  await port.close();
}


/**
 * Read from the device forever.
 */
const readDevice = async (reader) => {
  const textarea = document.getElementById('serial-console');
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { value, done } = await reader.read();
      
      if (done) {
        textarea.value += '\n--- Connection Closed ---';
        break;
      }
      
      textarea.value += decoder.decode(value);          
      textarea.scrollTop = textarea.scrollHeight;
    }
  } catch (error) {
    textarea.value += `\nSerial Error: ${error.message}\n`;
  }
}

/**
 * Set the wifi credentials on the device.
 */
const setWifiCreds = async (hostname, ssid, password) => {
  await python(`
from rb.core.wifi import configure_wifi
configure_wifi('${hostname}', '${ssid}', '${password}')
print('Wifi configured')`);
}

/**
 * Set the MQTT credentials on the device.
 */
const setMQTTCreds = async (broker, username, password) => {
  await python(`
from rb.mqtt.manager import set_mqtt_creds
set_mqtt_creds('${broker}', '${username}', '${password}')
print('MQTT configured')`);
}

const toggleBigClock = async () => {
  await python(`
from clock import toggle_big_clock
toggle_big_clock()`);
}

const setTimezone = async (name, offset) => {
  await python(`
from rb.core.tz import set_tz
set_tz('${name}', ${offset})
print('Timezone configured to ${name}')`);
}
