import { Model, generateMigration } from "./model";
import { DBIncrements, DBEnum, DBString, DBBinary, DBInteger, DBTimestamp } from "./columns";
import { op, avg, and, $, $b, $s } from "./expressions";
import { database } from "./database";

const Picture = new Model("picture", {
    id: new DBIncrements(),
    uploader: new DBInteger(),
    width: new DBInteger(),
    height: new DBInteger(),
    time: new DBTimestamp()
}, t => {
    t.primary("id");
    //t.foreign("uploader").ref(User, "id"); //TODO: MUST FIX IT!!!
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

console.log("Generated migration: " + generateMigration({}, {
    picture: Picture,
    user: User
}));

database({
    host: "192.168.3.3",
    port: 5432,
    user: "postgres",
    password: "password",
    database: "postgres"
}).then(db => {

db.with({
    asdf: Picture
}).from({
    a: "asdf",
    b: Picture
}).select(t => ({
    x: t.a.id
}));

db.with({
    a: Picture,
    b: User
}).from({
    a: "a",
    b: "b"
}).where(t => and(op(t.a.id, '=', t.b.profile_picture), op(t.b.id, '=', $<number, "id">("id")), $b("yes")));

db.with({
    a: Picture,
    b: User,
    c: Picture
}).from({
    a: Picture,
    s: "a"
});

db.from({
    a: Picture
});

db.from({
    p: Picture
}).select(t => ({
    
}));

db.select(t => ({
    a1: 17,
    a2: "test"
})).execute().then(s => {
}, r => {
    console.log(r);
});

/*BeginQuery.from([User, Picture]).select(t => ({
    a: t[0].id,
    b: t[1].height
}));*/

//TODO: Cannot use a table in a WITH statement!
db.with({
    //pp: Picture,
    test: db.from({user: User}).groupBy(t => ({a: t.user.id, b: t.user.email})).select((t, g) => ({id: g.a, email: g.b})),
    test2: db.from({user: User}).groupBy(t => ({a: t.user.id, b: t.user.email, c: $b("a")})).select((t, g) => ({id: g.a, email: g.b, test: $s("b")}))
})
.from({
    u: User,
    p: Picture,
    unused: "test",
    unused2: "test2",
    test2: db.from({user: User}).groupBy(t => ({a: t.user.id, b: t.user.email, c: $b("a")})).select((t, g) => ({id: g.a, email: g.b, test: $s("b")}))
})
.where(({p}) => and(op(p.height, '>=', 200), op(p.width, '>=', 200), $b("always_true")))
.where(({p, u}) => op(p.id, '=', u.profile_picture))
.where(({unused}) => op(unused.id, '=', unused.id))
.where(() => op($s("string_parameter"), '=', ""))
.groupBy(t => ({
    width: t.p.width,
    asdf: $s("string_parameter2")
}))
.having((tables, group) => {
    return and(op(avg(tables.p.height), '>=', 200), $b("bool_param"));
})
.select(({p, u}, group) => {
    return {
        picture_width: group.width,
        average_picture_height: avg(p.height),
        test: $s("string_parameter_3")
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

});