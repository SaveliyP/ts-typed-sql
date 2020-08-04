import { Model, generateMigration } from "./model";
import { DBIncrements, DBEnum, DBString, DBBinary, DBInteger, DBTimestamp } from "./columns";
import { op, avg, and } from "./expressions";
import { database } from "./database";
import { literals, $boolean, $text } from "./utils";

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

/*db.from({
    a: Picture,
    b: User
}).where(t => and(op(t.a.id, '=', t.b.profile_picture), op(t.b.id, '=', $<number, "id">("id")), $b("yes"))).select(a => ({
    x: 15
})).execute({
    id: 1,
    yes: true
});*/

/*db.select(t => ({
    a1: 17,
    a2: "test"
})).execute({
    
}).then(s => {
}, r => {
    console.log(r);
});*/

db.deleteFrom(Picture).where(t => op(t.id, '=', literals.integer("2"))).returning(t => ({
    w: t.width,
    h: t.height
})).execute({}).then(x => {
    
});

db.into(Picture).insert({
    id: literals.integer("1"),
    height: literals.integer("15"),
    time: literals.timestamp("2000=01-01T12:00:00.000000Z"),
    width: literals.integer("420"),
    uploader: literals.integer("1")
}).execute({}).then(x => {
    
});

db.with({
    a: db.select(x => ({
        a: literals.integer("2"),
        b: literals.integer("4")
    }))
}).update(Picture).using({
    test: User,
    test2: "a"
}).set((t, u) => ({
    width: op(t.width, '*', u.test2.a)
})).execute({}).then(x => {
    
});

//TODO: Cannot use a table in a WITH statement!
db.with({
    //pp: Picture,
    test: db.from({user: User}).groupBy(t => ({a: t.user.id, b: t.user.email})).select((t, g) => ({id: g.a, email: g.b})),
    test2: db.from({user: User}).groupBy(t => ({a: t.user.id, b: t.user.email, c: $boolean("a")})).select((t, g) => ({id: g.a, email: g.b, test: $text("b")}))
})
.from({
    u: User,
    p: Picture,
    unused: "test",
    unused2: "test2",
    test2: db.from({user: User}).groupBy(t => ({a: t.user.id, b: t.user.email, c: $boolean("a")})).select((t, g) => ({id: g.a, email: g.b, test: $text("b")}))
})
.where(({p}) => and(op(p.height, '>=', literals.integer("200")), op(p.width, '>=', literals.integer("200")), $boolean("always_true")))
.where(({p, u}) => op(p.id, '=', u.profile_picture))
.where(({unused}) => op(unused.id, '=', unused.id))
.where(() => op($text("string_parameter"), '=', literals.text("")))
.groupBy(t => ({
    width: t.p.width,
    asdf: $text("string_parameter2")
}))
.having((tables, group) => {
    return and(op(avg(tables.p.height), '>=', literals.integer("200")), $boolean("bool_param"));
})
.select(({p, u}, group) => {
    return {
        picture_width: group.width,
        average_picture_height: avg(p.height),
        test: $text("string_parameter_3")
    };
}).execute({
    a: true,
    b: "hello",
    always_true: true,
    bool_param: true,
    string_parameter: "",
    string_parameter2: "hello2",
    string_parameter_3: "hello_3"
}).then(result => {
    console.log(result);
    result.forEach(x => {
        x.average_picture_height.toExponential(16);
        x.picture_width.toPrecision(16);
    });
}).catch(res => {
    console.log("Generated (but did not execute) the query: " + res);
});

});
