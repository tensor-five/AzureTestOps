import "./local-ui.css";
import { bootstrapUiClient } from "./ui-client.js";

const container = document.getElementById("app");

if (!(container instanceof HTMLElement)) {
  throw new Error("Missing required #app container.");
}

bootstrapUiClient({ container });
