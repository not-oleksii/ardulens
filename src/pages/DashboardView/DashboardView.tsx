import { COLUMNS } from "../../analysis/metrics/metrics";

export function DashboardView() {
  return (
    <section>
      <h2>Огляд</h2>
      <p>Перетягніть .skylog/.bin, щоб побачити зведену таблицю по вильотах.</p>
      <p className="hint">Колонки: {COLUMNS.length}</p>
    </section>
  );
}
