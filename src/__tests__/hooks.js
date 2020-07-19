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
  return { sequelize, User };
};

let some_users_setup = async ({ User }) => {
  await User.create({
    name: "Michiel Dral",
    email: "m.c.dral@gmail.com",
    age: 22,
    verified: true,
  });
  await User.create({
    name: "Ola Beige",
    email: "o.l.beige@gmail.com",
    age: 22,
    verified: true,
  });
  await User.create({
    name: "Jake Strange",
    email: "j.strange@gmail.com",
    age: 24,
    verified: true,
  });
};

it("should work with simple insert", async () => {
  let { User } = define();

  let afterFindHook = jest.fn();
  User.addHook("afterFind", (items) => {
    afterFindHook();
    for (let item of items) {
      item.canDrink = item.age > 18;
      delete item.verified;
    }
  });

  some_users_setup({ User });

  let user = await User.findOne({
    where: {
      email: "m.c.dral@gmail.com",
    },
  });

  expect(afterFindHook).toBeCalled();
  expect(user).toMatchSnapshot();
});
