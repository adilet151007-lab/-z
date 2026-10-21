import { writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const password = randomBytes(12).toString("base64url");
const secret = randomBytes(48).toString("base64url");
try {
  await writeFile(new URL("../.env", import.meta.url),
    `TEACHER_PASSWORD=${password}\nSESSION_SECRET=${secret}\nPORT=3000\nSTATE_FILE=./data/game-state.json\n`,
    { flag: "wx", mode: 0o600 });
  console.log("Создан .env для локального запуска. Не загружайте этот файл на GitHub.");
  console.log(`Пароль преподавателя: ${password}`);
  console.log("Далее: npm start");
} catch (error) {
  if (error.code === "EEXIST") console.log("Файл .env уже существует; настройки сохранены.");
  else throw error;
}
