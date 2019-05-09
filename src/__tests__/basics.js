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
        defaultValue: Sequelize.UUIDV4
      },
      name: Sequelize.STRING,
      email: Sequelize.STRING,
      age: Sequelize.INTEGER,
      verified: Sequelize.BOOLEAN
    },
    options
  );
  return { sequelize, User };
};

let some_users_setup = async ({ User }) => {
  await User.create({
    name: "Michiel Dral",
    email: "m.c.dral@gmail.com",
    age: 22,
    verified: true
  });
  await User.create({
    name: "Ola Beige",
    email: "o.l.beige@gmail.com",
    age: 22,
    verified: true
  });
  await User.create({
    name: "Jake Strange",
    email: "j.strange@gmail.com",
    age: 24,
    verified: true
  });
};

it("should work with simple insert", async () => {
  let { sequelize, User } = define();

  let inserted = await User.create({
    name: "Michiel Dral",
    email: "m.c.dral@gmail.com",
    age: 22,
    verified: true
  });

  expect(inserted).toMatchSnapshot();
});

it("should update a specific user", async () => {
  let { sequelize, User } = define();
  await some_users_setup({ User });

  let jake = await User.findOne({ where: { email: "j.strange@gmail.com" } });
  await User.update(
    {
      age: 25
    },
    {
      where: { id: jake.id }
    }
  );

  let users = await User.findAll();
  expect(users).toMatchSnapshot();
});

it("should remove a specific user", async () => {
  let { sequelize, User } = define();
  await some_users_setup({ User });

  let jake = await User.findOne({ where: { email: "j.strange@gmail.com" } });
  await User.destroy({
    where: { id: jake.id }
  });

  let users = await User.findAll();
  expect(users).toMatchSnapshot();
});

it("should update a selection of users", async () => {
  let { sequelize, User } = define();
  await some_users_setup({ User });

  await User.update(
    {
      age: 23
    },
    {
      where: { age: 22 }
    }
  );

  let users = await User.findAll();
  expect(users).toMatchSnapshot();
});

it("should remove a selection of users", async () => {
  let { sequelize, User } = define();
  await some_users_setup({ User });

  await User.destroy({
    where: { age: 22 }
  });

  let users = await User.findAll();
  expect(users).toMatchSnapshot();
});

it("sync will do nothing", async () => {
  let { sequelize, User } = define();
  await some_users_setup({ User });

  let pre_force = await User.findAll();
  await sequelize.sync();
  await User.sync();
  let users = await User.findAll();
  expect(users).toMatchSnapshot(pre_force);
});

it("sequelize.sync({ force: true }) will clear database", async () => {
  let { sequelize, User } = define();
  await some_users_setup({ User });

  await sequelize.sync({ force: true });
  let users = await User.findAll();
  expect(users).toMatchSnapshot([]);
});

it("User.sync({ force: true }) will clear database", async () => {
  let { sequelize, User } = define();
  await some_users_setup({ User });

  await User.sync({ force: true });
  let users = await User.findAll();
  expect(users).toMatchSnapshot([]);
});

it("should not add createdAt and updatedAt if timestamps are disabled", async () => {
  let { sequelize, User } = define({ timestamps: false });
  await some_users_setup({ User });
  let users = await User.findAll();

  expect(users).toMatchSnapshot();
});
