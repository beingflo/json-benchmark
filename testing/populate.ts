import { faker } from "@faker-js/faker";

console.log("deleting ...");
await fetch("http://localhost:3000/delete", {
  method: "POST",
});
console.log("deleted");

faker.seed(123);

// CO2 - 30s
const startDate = new Date("01/01/2023");
const endDate = new Date("02/15/2023");
let curDate = structuredClone(startDate);

const payloads: Array<any> = [];
while (curDate.getTime() < endDate.getTime()) {
  const payload = {
    data: { co2: faker.number.int({ min: 330, max: 2000 }) },
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
    timestamp: curDate.toISOString(),
  };
  payloads.push(payload);
  curDate = new Date(curDate.getTime() + 60_000);
}

payloads.sort(
  (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
);

console.log("populating ...");
await fetch("http://localhost:3000", {
  method: "POST",
  body: JSON.stringify(payloads),
  headers: { "Content-Type": "application/json" },
});
console.log("populated");
