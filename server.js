import express from "express";
import axios from "axios";
import cors from "cors";
import { startDailyRemindersCron } from "./src/cron/dailyReminderJob.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/proxy", async (req, res) => {
  try {
    const response = await axios.get("https://script.google.com/a/macros/botivate.in/s/AKfycbxjYYdBHyeK1n65Er6c76ymzKvBvZr8ixit2_OUTRA/dev"); 
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start background cron jobs
startDailyRemindersCron();

app.listen(5000, () => console.log("Server running on port 5000"));
