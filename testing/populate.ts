import { faker } from "@faker-js/faker";
import * as Throttle from "promise-parallel-throttle";

console.log("deleting ...");
await fetch("http://localhost:3000/delete", {
  method: "POST",
});
console.log("deleted");

faker.seed(123);

// CO2 - 30s
const startDate = new Date("01/01/2023");
const endDate = new Date("12/31/2023");
let curDate = structuredClone(startDate);

const payloads: Array<any> = [];
while (curDate.getTime() < endDate.getTime()) {
  const payload = {
    data: { co2: faker.number.int({ min: 330, max: 2000 }) },
    type: "co2",
    timestamp: curDate.toISOString(),
  };
  payloads.push(payload);
  curDate = new Date(curDate.getTime() + 30_000);
}

// Location - 10m
curDate = structuredClone(startDate);

while (curDate.getTime() < endDate.getTime()) {
  const payload = {
    data: {
      longitude: faker.location.longitude(),
      latitude: faker.location.latitude(),
    },
    type: "location",
    timestamp: curDate.toISOString(),
  };
  payloads.push(payload);
  curDate = new Date(curDate.getTime() + 600_000);
}

// Humidity - 5m
curDate = structuredClone(startDate);

while (curDate.getTime() < endDate.getTime()) {
  const payload = {
    data: {
      humidity: faker.number.float({ min: 0, max: 100 }),
    },
    type: "humidity",
    timestamp: curDate.toISOString(),
  };
  payloads.push(payload);
  curDate = new Date(curDate.getTime() + 300_000);
}

// Brightness - 1m
curDate = structuredClone(startDate);

while (curDate.getTime() < endDate.getTime()) {
  const payload = {
    data: {
      lux: faker.number.float({ min: 0, max: 100_000 }),
    },
    type: "brightness",
    timestamp: curDate.toISOString(),
  };
  payloads.push(payload);
  curDate = new Date(curDate.getTime() + 60_000);
}

payloads.sort(
  (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
);

const doRequest = async (payload, idx) => {
  await fetch("http://localhost:3000", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });
  if (idx % 1000 === 0) {
    console.log(`${((idx / payloads.length) * 100).toFixed(1)}%`);
  }
};

const queued = payloads.map((p, idx) => () => doRequest(p, idx));

await Throttle.all(queued, { maxInProgress: 1 });
