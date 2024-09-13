import { faker } from "@faker-js/faker";
import * as Throttle from "promise-parallel-throttle";

console.log("deleting ...");
await fetch("http://localhost:3000/delete", {
  method: "POST",
});
console.log("deleted");

faker.seed(123);

const startDate = new Date("01/01/2023");
const endDate = new Date("12/31/2023");
let curDate = structuredClone(startDate);

const payloads: Array<any> = [];

// Location - 10m
while (curDate.getTime() < endDate.getTime()) {
  const payload = {
    data: {
      longitude: faker.location.longitude(),
      latitude: faker.location.latitude(),
    },
    bucket: "location",
    timestamp: curDate.toISOString(),
  };
  payloads.push(payload);
  curDate = new Date(curDate.getTime() + 600_000);
}

// CO2 - 1m
curDate = structuredClone(startDate);

while (curDate.getTime() < endDate.getTime()) {
  const payload = {
    data: {
      co2: faker.number.float({ min: 0, max: 5000 }),
    },
    bucket: "co2",
    timestamp: curDate.toISOString(),
  };
  payloads.push(payload);
  curDate = new Date(curDate.getTime() + 60_000);
}

// Structured logs - 1h bursty
curDate = structuredClone(startDate);

while (curDate.getTime() < endDate.getTime()) {
  let count = 10;
  while (count > 0) {
    const user = faker.internet.userName();
    const endpoint = faker.internet.url();
    const payload = {
      data: {
        span_id: faker.number.int(),
        level: faker.datatype.boolean(0.95) ? "success" : "error",
        user,
        message: faker.company.buzzPhrase(),
        endpoint,
      },
      bucket: "logs",
      timestamp: curDate.toISOString(),
    };
    payloads.push(payload);
    curDate = new Date(curDate.getTime() + 100);
    count -= 1;
  }
  curDate = new Date(curDate.getTime() + 3_600_000);
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

await Throttle.all(queued, { maxInProgress: 10 });
