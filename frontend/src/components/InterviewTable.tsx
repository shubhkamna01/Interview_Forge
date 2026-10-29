import type { Interview } from "../data/mock";

export function InterviewTable({ rows }: { rows: Interview[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">TIME</th>
            <th scope="col">CANDIDATE</th>
            <th scope="col">INTERVIEWER</th>
            <th scope="col">ROOM</th>
            <th scope="col">STATUS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="time-cell">{row.time}</td>
              <td>
                <strong>{row.candidate}</strong>
                <span className="secondary-cell">{row.role}</span>
              </td>
              <td>{row.interviewer}</td>
              <td>{row.room}</td>
              <td>
                <span className={`status ${row.status.toLowerCase()}`}>{row.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
