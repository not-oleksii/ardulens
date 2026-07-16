import { COLUMNS } from "@ardulens/core";

export function DashboardView() {
  return (
    <section>
      <h2>Огляд</h2>
      <p>Перетягніть .skylog/.bin, щоб побачити зведену таблицю по вильотах.</p>
      <p className="hint">Колонки з @ardulens/core: {COLUMNS.length}</p>
    </section>
  );
}
