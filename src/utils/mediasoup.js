

import { Device } from "mediasoup-client";

export let device = new Device();

export function createDevice() {
  device = new Device();
  return device;
}

