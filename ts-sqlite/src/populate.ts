import { faker } from "@faker-js/faker";

export const populate = () => {
  // CO2 - 10s
  const startDate = new Date("01/01/2023");
  const endDate = new Date("12/31/2023");
  let curDate = structuredClone(startDate);

  const payloads = [];
  while (curDate.getTime() < endDate.getTime()) {
    const payload = {
      data: { co2: faker.number.int({ min: 330, max: 2000 }) },
      timestamp: curDate.toISOString(),
    };
    payloads.push(payload);
    curDate = new Date(curDate.getTime() + 10000);
  }
  console.log(payloads.length);
  // Location - 10m
  // Humidity - 10m
  // Brightness - 1m
};
