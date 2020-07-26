# ts-typed-sql
A fully typed SQL builder for TypeScript.

Eventually it should support all possible SQL statements while retaining type information. Right now it only supports defining models, basic SELECT statements with CTEs, some operators and the avg() function. Adding more operators and functions is just a matter of grinding through the SQL documentation.

Currently I'm targetting PostgreSQL, because it has better documentation, but eventually it will support other SQL dialects too.

### Latest working example

```typescript
import { Model, generateMigration } from "./model";
import { DBIncrements, DBEnum, DBString, DBBinary, DBInteger, DBTimestamp } from "./columns";
import { BeginQuery } from "./select";
import { op, avg, and } from "./expressions";
import { database } from "./database";

const Picture = new Model("picture", {
    id: new DBIncrements(),
    uploader: new DBInteger(),
    width: new DBInteger(),
    height: new DBInteger(),
    time: new DBTimestamp()
}, t => {
    t.primary("id");
});

const User = new Model("user", {
    id: new DBIncrements(),
    privilege: new DBEnum(["user", "mod"]),
    username: new DBString(255),
    password: new DBBinary(16),
    email: new DBString(255),
    registration_time: new DBTimestamp(),
    profile_picture: new DBInteger()
}, t => {
    t.primary("id");
    t.unique("username");
    t.unique("email");
    t.foreign("profile_picture").ref(Picture, "id");
});

const db = await database({
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: "password",
    database: "postgres"
});

db.with({
    test: db.from({user: User}).groupBy(t => ({a: t.user.id, b: t.user.email})).select((t, g) => ({id: g.a, email: g.b}))
})
.from({
    u: User,
    p: Picture,
    unused: "test"
})
.where(({p}) => and(op(p.height, '>=', 200), op(p.width, '>=', 200)))
.where(({p, u}) => op(p.id, '=', u.profile_picture))
.where(({unused}) => op(unused.id, '=', unused.id))
.groupBy(t => ({
    width: t.p.width
}))
.having((tables, group) => {
    return op(avg(tables.p.height), '>=', 200);
})
.select(({p, u}, group) => {
    return {
        picture_width: group.width,
        average_picture_height: avg(p.height),
    };
}).execute().then(result => {
    console.log(result);
    result.forEach(x => {
        x.average_picture_height.toExponential(16);
        x.picture_width.toPrecision(16);
    });
}).catch(res => {
    console.log("Generated (but did not execute) the query: " + res);
});

console.log("Generated migration: " + generateMigration({}, {
    picture: Picture,
    user: User
}));
```

Output:

```SQL
Generated migration: CREATE TABLE "picture" (
        "id" SERIAL,
        "uploader" INT,
        "width" INT,
        "height" INT,
        "time" TIMESTAMP,
        CONSTRAINT "PK_picture" PRIMARY KEY ("id")
);
CREATE TABLE "user" (
        "id" SERIAL,
        "privilege" VARCHAR(4),
        "username" VARCHAR(255),
        "password" BYTEA,
        "email" VARCHAR(255),
        "registration_time" TIMESTAMP,
        "profile_picture" INT,
        CONSTRAINT "PK_user" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_username" UNIQUE ("username"),
        CONSTRAINT "UQ_user_email" UNIQUE ("email")
);
ALTER TABLE "user"
        ADD CONSTRAINT "FK_user_picture_profile__picture" FOREIGN KEY ("profile_picture") REFERENCES "picture"("id");

Executing WITH "test" AS (SELECT "user"."id" AS "id","user"."email" AS "email" FROM "user" AS "user" GROUP BY "user"."id","user"."email") SELECT "p"."width" AS "picture_width",AVG("p"."height") AS "average_picture_height" FROM "user" AS "u","picture" AS "p","test" AS "unused" WHERE "p"."height" >= 200 AND "p"."width" >= 200 AND "p"."id" = "u"."profile_picture" AND "unused"."id" = "unused"."id" GROUP BY "p"."width" HAVING AVG("p"."height") >= 200
Result {
  command: 'SELECT',
  rowCount: 1,
  oid: null,
  rows: [
    {
      picture_width: 1920,
      average_picture_height: '1080.0000000000000000'
    }
  ],
  fields: [
    Field {
      name: 'picture_width',
      tableID: 16386,
      columnID: 3,
      dataTypeID: 23,
      dataTypeSize: 4,
      dataTypeModifier: -1,
      format: 'text'
    },
    Field {
      name: 'average_picture_height',
      tableID: 0,
      columnID: 0,
      dataTypeID: 1700,
      dataTypeSize: -1,
      dataTypeModifier: -1,
      format: 'text'
    }
  ],
  _parsers: [ [Function: parseInteger], [Function: noParse] ],
  _types: TypeOverrides {
    _types: {
      getTypeParser: [Function: getTypeParser],
      setTypeParser: [Function: setTypeParser],
      arrayParser: [Object],
      builtins: [Object]
    },
    text: {},
    binary: {}
  },
  RowCtor: null,
  rowAsArray: false
}
[
  {
    picture_width: 1920,
    average_picture_height: '1080.0000000000000000'
  }
]
Generated (but did not execute) the query: TypeError: x.average_picture_height.toExponential is not a function
```

### TODO:

 - INSERT
 - UPDATE
 - Register more types for pg-types
 - Right now, only implicit inner joins work with FROM clause. Need to add explicit joins.
 - Prepared queries
 - Allow passing tables as parameters into .from()
 - Add more operators and functions
 - Some final bits and pieces for migration code
 - Extra syntax and options for model columns to fully implement CREATE TABLE
 - Add support for more syntax
 - CURSORs
 - Result streaming
 - MySQL & extendable dialect support
 - Continue adding precedence to reduce parentheses (probably not that important and a potential place to introduce errors)
 - Lots of other stuff

### Housekeeping:

 - Figure out whether I should use webpack
