import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();
const DATA_FILE = path.join(process.cwd(), "backend/data/users.json");

function getUsers() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch (e) {
    return [];
  }
}

router.get("/", (req, res) => {
  res.json(getUsers());
});

export default router;
