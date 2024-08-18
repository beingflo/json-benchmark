import { faker } from "@faker-js/faker";

// CO2 - 30s
let startDate = new Date("01/01/2023");
let endDate = new Date("12/31/2023");
let curDate = structuredClone(startDate);

const payloads = [];
while (curDate.getTime() < endDate.getTime()) {
  const payload = {
    data: { co2: faker.number.int({ min: 330, max: 2000 }) },
    timestamp: curDate.toISOString(),
  };
  payloads.push(payload);
  curDate = new Date(curDate.getTime() + 30_000);
}

// Location - 10m
startDate = new Date("01/01/2023");
endDate = new Date("12/31/2023");
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
startDate = new Date("01/01/2023");
endDate = new Date("12/31/2023");
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
startDate = new Date("01/01/2023");
endDate = new Date("12/31/2023");
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
