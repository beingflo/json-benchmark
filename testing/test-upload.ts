import { faker } from "@faker-js/faker";

const response = await fetch("http://localhost:3000", {
  method: "POST",
  body: JSON.stringify({
    data: { co2: faker.number.int({ min: 0, max: 100_000 }) },
    timestamp: new Date().toISOString(),
  }),
  headers: { "Content-Type": "application/json" },
});

if (response.status === 200) {
  console.log("OK 200");
} else {
  console.log(response);
}
