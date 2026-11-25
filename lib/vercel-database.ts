import type { Client, ResultSet } from "@libsql/client";
import type { Database, QueryResult, SqlValue, Statement } from "./database";

function rows<T>(result: ResultSet): T[] {
  return result.rows.map(row => Object.fromEntries(
    result.columns.map((name, index) => [name, row[index]]),
  ) as T);
}

function queryResult<T>(result: ResultSet): QueryResult<T> {
  return { results: rows<T>(result), meta: { changes: result.rowsAffected } };
}

class LibsqlStatement implements Statement {
  readonly client: Client;
  readonly sql: string;
  readonly args: SqlValue[];

  constructor(client: Client, sql: string, args: SqlValue[] = []) {
    this.client = client;
    this.sql = sql;
    this.args = args;
  }

  bind(...values: SqlValue[]) {
    return new LibsqlStatement(this.client, this.sql, values);
  }

  async all<T = Record<string, unknown>>() {
    return queryResult<T>(await this.client.execute({ sql: this.sql, args: this.args }));
  }

  run<T = Record<string, unknown>>() {
    return this.all<T>();
  }

  async first<T = Record<string, unknown>>() {
    return (await this.all<T>()).results[0] ?? null;
  }
}

export function createVercelDatabase(client: Client): Database {
  return {
    prepare: sql => new LibsqlStatement(client, sql),
    async batch<T>(statements: Statement[]) {
      const queries = statements.map(statement => {
        if (!(statement instanceof LibsqlStatement) || statement.client !== client) {
          throw new Error("Cannot batch statements from another database.");
        }
        return { sql: statement.sql, args: statement.args };
      });
      // libSQL commits the entire batch in one transaction or rolls it back.
      return (await client.batch(queries, "write")).map(queryResult<T>);
    },
  };
}
