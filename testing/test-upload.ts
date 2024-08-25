import { faker } from "@faker-js/faker";

const response = await fetch("http://localhost:3000", {
  method: "POST",
  body: JSON.stringify({
    co2: faker.number.int({ min: 0, max: 100_000 }),
    type: "co2",
    timestamp: new Date().toISOString(),
  }),
  headers: { "Content-Type": "application/json" },
});

if (response.status === 200) {
  console.log("OK 200");
} else {
  console.log(response);
}
