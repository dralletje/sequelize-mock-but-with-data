// @ts-nocheck
let Sequelize = require("sequelize");

// I should move to observatory or something,
// but this works for now
const DATE_TO_USE = new Date("2016");
const _Date = Date;
global.Date = jest.fn(() => DATE_TO_USE);
global.Date.UTC = _Date.UTC;
global.Date.parse = _Date.parse;
global.Date.now = _Date.now;

let define = (options = {}) => {
  let sequelize = new Sequelize();
  let User = sequelize.define(
    "User",
    {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      name: Sequelize.STRING,
      email: Sequelize.STRING,
      age: Sequelize.INTEGER,
      verified: Sequelize.BOOLEAN,
    },
    options
  );

  User.belongsTo(User, {
    foreignKey: "followingId",
    as: "Follower",
  });

  User.hasMany(User, {
    foreignKey: "followingId",
    as: "Followers",
  });

  return { sequelize, User };
};

let define_with_scope = (options = {}) => {
  let sequelize = new Sequelize();
  let User = sequelize.define(
    "User",
    {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      name: Sequelize.STRING,
      email: Sequelize.STRING,
      age: Sequelize.INTEGER,
      verified: Sequelize.BOOLEAN,
    },
    options
  );

  User.belongsTo(User, {
    foreignKey: "followingId",
    as: "Follower",
  });

  User.hasMany(User, {
    foreignKey: "followingId",
    as: "Followers",
    scope: {
      verified: true,
    },
  });

  return { sequelize, User };
};

let some_users_setup = async ({ User }) => {
  let jake = await User.create({
    name: "Jake Strange",
    email: "j.strange@gmail.com",
    age: 24,
    verified: true,
  });

  let michiel = await User.create({
    name: "Michiel Dral",
    email: "m.c.dral@gmail.com",
    age: 22,
    verified: false,
    followingId: jake.id,
  });
  let ola = await User.create({
    name: "Ola Beige",
    email: "o.l.beige@gmail.com",
    age: 23,
    verified: true,
    followingId: jake.id,
  });

  // await jake.setFollowers([michiel.id, ola.id]);
};

it("hasMany relationship", async () => {
  let { User } = define();

  await some_users_setup({ User });

  let user = await User.findOne({
    where: {
      email: "j.strange@gmail.com",
    },
  });
  let followers = await user.getFollowers();

  expect(followers).toMatchSnapshot();
});

it("hasMany relationship with scope", async () => {
  let { User } = define_with_scope();

  await some_users_setup({ User });

  let user = await User.findOne({
    where: {
      email: "j.strange@gmail.com",
    },
  });
  let followers = await user.getFollowers();

  expect(followers).toMatchSnapshot();
});
