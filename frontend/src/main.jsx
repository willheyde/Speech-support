import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SpeechCoach from "./SpeechCoach";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SpeechCoach />
  </StrictMode>
);