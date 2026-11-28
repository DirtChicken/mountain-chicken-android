import { nodeOdmClient } from "./odm";
import { createGateway } from "./server";
import { JobStore } from "./store";

const key = process.env.APP_KEY ?? "";
if (!key) {
  console.error("APP_KEY is missing. Copy .env.example to .env and set a long random key.");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 8787);
const gateway = createGateway({
  key,
  store: new JobStore(process.env.DATA_DIR ?? "/data"),
  odm: nodeOdmClient(process.env.NODEODM_URL ?? "http://nodeodm:3000"),
  port,
});

void gateway.listen(port).then((bound) => {
  console.log(`Mountain Chicken gateway listening on ${bound}`);
});
