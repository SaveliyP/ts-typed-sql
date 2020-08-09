# TypeSQL
A fully typed SQL builder for TypeScript.

Eventually it should support all possible SQL statements while retaining type information. Right now it supports defining models, SELECT, INSERT, UPDATE and DELETE statements with CTEs, some operators and the avg() function. Adding more operators and functions is just a matter of grinding through the SQL documentation. Current syntax may be slightly awkward, but it is preliminary. Any suggestions are welcome.

Currently I'm targetting PostgreSQL, because it has better documentation, but eventually it will support other SQL dialects too.

### Latest working example

```typescript
import { Model, generateMigration, schema, types as t, ops as o, defaultTypes, $, l, db } from "@saveliyp/type-sql";

const Picture = new Model("picture", {
    id: new t.Increments(),
    uploader: new t.Integer(),
    width: new t.Integer(),
    height: new t.Integer(),
    time: new t.Timestamp()
}, t => {
    t.primary("id");
    t.foreign("uploader").ref(User, "id");
});

const User = new Model("user", {
    id: new t.Increments(),
    privilege: new t.Enum(["user", "mod"]),
    username: new t.String(255),
    password: new t.Binary(16),
    email: new t.String(255),
    registration_time: new t.Timestamp(),
    profile_picture: new t.Integer()
}, t => {
    t.primary("id");
    t.unique("username");
    t.unique("email");
    t.foreign("profile_picture").ref(Picture, "id");
});

db({
    host: "192.168.3.3",
    port: 5432,
    user: "postgres",
    password: "password",
    database: "postgres"
}, defaultTypes).then(async db => {

//Generate and run a migration from {} to {picture, user}
await db.raw(generateMigration(schema([]), schema([Picture, User])));

//Insert some values
//Currently this syntax is clumsy
//Need to allow raw literals to be used
await db.into(User).insert({
    id: l.integer("1"),
    email: l.text("testuser@example.com"),
    username: l.text("testuser"),
    password: l.binary("p@ssw0rd"),
    privilege: l.enum("mod"),
    profile_picture: l.integer(null),
    registration_time: l.timestamp(new Date().toISOString()),
}, {
    id: l.integer("2"),
    email: l.text("testuser2@example.com"),
    username: l.text("testuser2"),
    password: l.binary("p@ssw0rd"),
    privilege: l.enum("user"),
    profile_picture: l.integer(null),
    registration_time: l.timestamp(new Date().toISOString()),
}).execute({});
await db.into(Picture).insert({
    id: l.integer("1"),
    height: l.integer("1080"),
    time: l.timestamp("2000-01-01T12:00:00.000000Z"),
    width: l.integer("1920"),
    uploader: l.integer("1")
}, {
    id: l.integer("2"),
    height: l.integer("768"),
    time: l.timestamp("2000-01-01T12:00:00.000000Z"),
    width: l.integer("1360"),
    uploader: l.integer("1")
}, {
    id: l.integer("3"),
    height: l.integer("480"),
    time: l.timestamp("2000-01-01T12:00:00.000000Z"),
    width: l.integer("640"),
    uploader: l.integer("2")
}).execute({});

await db.update(User).where(t => o.op(t.id, '=', l.integer("1"))).set(t => ({
    profile_picture: l.integer("1")
})).execute({});
await db.update(User).where(t => o.op(t.id, '=', l.integer("2"))).set(t => ({
    profile_picture: l.integer("3")
})).execute({});

//A random complex SELECT statement
console.log(await db.with({
    //pp: Picture, //TODO: Cannot use a table in a WITH statement!
    test1: db.from({user: User}).groupBy(t => ({a: t.user.id, b: t.user.email})).select((t, g) => ({id: g.a, email: g.b})),
    test2: db.from({user: User}).groupBy(t => ({a: t.user.id, b: t.user.email, c: $.boolean("a")})).select((t, g) => ({id: g.a, email: g.b, test: $.text("b")}))
})
.from({
    u: User,
    p: Picture,
    unused: "test1",
    unused2: "test2",
    test2: db.from({user: User}).groupBy(t => ({a: t.user.id, b: t.user.email, c: $.boolean("a")})).select((t, g) => ({id: g.a, email: g.b, test: $.text("b")}))
})
.where(({p}) => o.and(o.op(p.height, '>=', l.integer("200")), o.op(p.width, '>=', l.integer("200")), $.boolean("check_parameter")))
.where(({p, u}) => o.op(p.id, '=', u.profile_picture))
.where(({unused}) => o.op(unused.id, '=', unused.id))
.where(() => o.op($.text("string_parameter"), '=', l.text("")))
.groupBy(t => ({
    width: t.p.width,
    asdf: $.text("string_parameter2")
}))
.having((tables, group) => {
    return o.and(o.op(o.avg(tables.p.height), '>=', l.integer("200")), $.boolean("check_parameter"));
})
.select(({p, u}, group) => {
    return {
        picture_width: group.width,
        average_picture_height: o.avg(p.height),
        test: $.text("string_parameter_3")
    };
}).execute({
    a: true,
    b: "hello",
    check_parameter: true,
    string_parameter: "",
    string_parameter2: "hello2",
    string_parameter_3: "hello_3"
}));

await db.with({
    a: db.select(x => ({
        a: l.integer("2"),
        b: l.integer("4")
    }))
}).update(Picture).using({
    test: User,
    test2: "a"
}).set((t, u) => ({
    width: o.op(t.width, '*', u.test2.a)
})).execute({});

await db.update(User).set(t => ({
    profile_picture: l.integer(null)
})).execute({});

console.log(await db.deleteFrom(Picture).where(t => o.op(t.id, '=', l.integer("2"))).returning(t => ({
    w: t.width,
    h: t.height
})).execute({}));

console.log(await db.deleteFrom(Picture).returning(t => ({
    w: t.width,
    h: t.height
})).execute({}));

console.log(await db.deleteFrom(User).returning(t => ({
    email: t.email,
    username: t.username
})).execute({}));

//Generate and run a migration from {picture, user} to {}
await db.raw(generateMigration(schema([Picture, User]), schema([])));
await db.close();
});
```

Output:

```SQL
Query: CREATE TABLE "picture" (
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
ALTER TABLE "picture"
	ADD CONSTRAINT "FK_picture_user_uploader" FOREIGN KEY ("uploader") REFERENCES "user"("id");
ALTER TABLE "user"
	ADD CONSTRAINT "FK_user_picture_profile__picture" FOREIGN KEY ("profile_picture") REFERENCES "picture"("id");

Query: INSERT INTO "user" AS "__inserting" ("id","email","username","password","privilege","profile_picture","registration_time") VALUES (CAST ($1 AS INT),CAST ($2 AS TEXT),CAST ($3 AS TEXT),CAST ($4 AS BYTEA),CAST ($5 AS VARCHAR),CAST ($6 AS INT),CAST ($7 AS TIMESTAMP)),(CAST ($8 AS INT),CAST ($9 AS TEXT),CAST ($10 AS TEXT),CAST ($11 AS BYTEA),CAST ($12 AS VARCHAR),CAST ($13 AS INT),CAST ($14 AS TIMESTAMP))
Parameters: [
  '1',
  'testuser@example.com',
  'testuser',
  'p@ssw0rd',
  'mod',
  null,
  '2020-08-08T23:10:44.593Z',
  '2',
  'testuser2@example.com',
  'testuser2',
  'p@ssw0rd',
  'user',
  null,
  '2020-08-08T23:10:44.593Z'
]

Query: INSERT INTO "picture" AS "__inserting" ("id","height","time","width","uploader") VALUES (CAST ($1 AS INT),CAST ($2 AS INT),CAST ($3 AS TIMESTAMP),CAST ($4 AS INT),CAST ($5 AS INT)),(CAST ($6 AS INT),CAST ($7 AS INT),CAST ($8 AS TIMESTAMP),CAST ($9 AS INT),CAST ($10 AS INT)),(CAST ($11 AS INT),CAST ($12 AS INT),CAST ($13 AS TIMESTAMP),CAST ($14 AS INT),CAST ($15 AS INT))
Parameters: [
  '1',
  '1080',
  '2000-01-01T12:00:00.000000Z',
  '1920',
  '1',
  '2',
  '768',
  '2000-01-01T12:00:00.000000Z',
  '1360',
  '1',
  '3',
  '480',
  '2000-01-01T12:00:00.000000Z',
  '640',
  '2'
]

Query: UPDATE "user" AS "__updating" SET "profile_picture"=CAST ($1 AS INT) WHERE "__updating"."id" = CAST ($2 AS INT)
Parameters: [ '1', '1' ]

Query: UPDATE "user" AS "__updating" SET "profile_picture"=CAST ($1 AS INT) WHERE "__updating"."id" = CAST ($2 AS INT)
Parameters: [ '3', '2' ]

Query: WITH "test1" AS (SELECT "user"."id" AS "id","user"."email" AS "email" FROM "user" AS "user" GROUP BY "user"."id","user"."email"),"test2" AS (SELECT "user"."id" AS "id","user"."email" AS "email",CAST ($1 AS TEXT) AS "test" FROM "user" AS "user" GROUP BY "user"."id","user"."email",CAST ($2 AS BOOLEAN)) SELECT "p"."width" AS "picture_width",AVG("p"."height") AS "average_picture_height",CAST ($3 AS TEXT) AS "test" FROM "user" AS "u","picture" AS "p","test1" AS "unused","test2" AS "unused2",(SELECT "user"."id" AS "id","user"."email" AS "email",CAST ($1 AS TEXT) AS "test" FROM "user" AS "user" GROUP BY "user"."id","user"."email",CAST ($2 AS BOOLEAN)) AS "test2" WHERE "p"."height" >= CAST ($4 AS INT) AND "p"."width" >= CAST ($5 AS INT) AND CAST ($6 AS BOOLEAN) AND "p"."id" = "u"."profile_picture" AND "unused"."id" = "unused"."id" AND CAST ($7 AS TEXT) = CAST ($8 AS TEXT) GROUP BY "p"."width",CAST ($9 AS TEXT) HAVING AVG("p"."height") >= CAST ($10 AS INT) AND CAST ($6 AS BOOLEAN)
Parameters: [
  'hello',   'true',
  'hello_3', '200',
  '200',     'true',
  '',        '',
  'hello2',  '200'
]
Result: [
  {
    picture_width: 1920,
    average_picture_height: 1080,
    test: 'hello_3'
  },
  { picture_width: 640, average_picture_height: 480, test: 'hello_3' }
]

Query: WITH "a" AS (SELECT CAST ($1 AS INT) AS "a",CAST ($2 AS INT) AS "b") UPDATE "picture" AS "__updating" SET "width"="__updating"."width" * "test2"."a" FROM "user" AS "test","a" AS "test2"
Parameters: [ '2', '4' ]

Query: UPDATE "user" AS "__updating" SET "profile_picture"=CAST ($1 AS INT)
Parameters: [ null ]

Query: DELETE FROM "picture" AS "__deleting" WHERE "__deleting"."id" = CAST ($1 AS INT) RETURNING "__deleting"."width" AS "w","__deleting"."height" AS "h"
Parameters: [ '2' ]
Result: [ { w: 2720, h: 768 } ]

Query: DELETE FROM "picture" AS "__deleting" RETURNING "__deleting"."width" AS "w","__deleting"."height" AS "h"
Parameters: []
Result: [ { w: 3840, h: 1080 }, { w: 1280, h: 480 } ]

Query: DELETE FROM "user" AS "__deleting" RETURNING "__deleting"."email" AS "email","__deleting"."username" AS "username"
Parameters: []
Result: [
  { email: 'testuser@example.com', username: 'testuser' },
  { email: 'testuser2@example.com', username: 'testuser2' }
]

Query: ALTER TABLE "picture"
DROP CONSTRAINT "FK_picture_user_uploader";
ALTER TABLE "user"
DROP CONSTRAINT "FK_user_picture_profile__picture";
DROP TABLE "picture";
DROP TABLE "user";
```

### TODO:

 - Refactor
   - Move certain types and functions into the files where they make more sense
 - Add support for NULLs
 - Add more operators and functions
 - Right now, only implicit inner joins work with FROM clause. Need to add explicit joins.
 - .insert() allows extra fields and doesn't require needed fields
   - A type should include information about whether it is nullable and whether it has a default value
   - .update() also probably has the same problem
 - Add literal support
   - Using this library should be simpler than just manually writing the SQL. Having to write l.integer() each time is bad
   - Potential problem: ambiguous types (e.g. "float" and "int" are both number in JS, but one must be selected)
     - TIMESTAMP is a superset of DATE and DATETIME, and FLOAT is a superset of INT
     - but FLOAT cannot be used in the % operator, while INT can
     - figure out which types make sense for a certain operator and choose the superset?
 - Add typings to enums
 - Add typings to JSON
 - Error messages are very complex due to complex types.
 - Subqueries need to have access to base query tables
   - SELECT.where() should be (from, groups, with) => expr.
   - SELECT.having() should be (from, groups, with) => expr.
   - DELETE.where() should be (from, groups, with) => expr.
   - UPDATE.set() should be (update, using, with) => expr.
 - WITH should prefix table names with __ to prevent collisions
 - Prepared queries
 - Allow passing tables as parameters into .from()
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
