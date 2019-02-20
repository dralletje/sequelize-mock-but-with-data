let Sequelize = require("sequelize");

const DATE_TO_USE = new Date("2016");
const _Date = Date;
global.Date = jest.fn(() => DATE_TO_USE);
global.Date.UTC = _Date.UTC;
global.Date.parse = _Date.parse;
global.Date.now = _Date.now;

let define = () => {
  let sequelize = new Sequelize();
  let Item = sequelize.define("ItemWithDescription", {
    description: Sequelize.STRING,
  });
  return { sequelize, Item };
};

it("should record insert operation", async () => {
  let { sequelize, Item } = define();

  let mutations = [];
  sequelize.mock.on("mutation", (mutation) => {
    mutations.push(mutation);
  });

  await Item.create({
    description: "Some description",
  });

  expect(mutations).toEqual([
    {
      collection_name: 'ItemWithDescription',
      item: {
        createdAt: new Date("2016"),
        description: "Some description",
        updatedAt: new Date("2016"),
      },
      type: "create",
    },
  ]);
});

it("should record remove operation", async () => {
  let { sequelize, Item } = define();

  await Item.create({
    description: "Some description",
  });

  let mutations = [];
  sequelize.mock.on("mutation", (mutation) => {
    mutations.push(mutation);
  });

  await Item.destroy();

  expect(mutations).toEqual([
    {
      collection_name: 'ItemWithDescription',
      items: [{
        createdAt: new Date("2016"),
        description: "Some description",
        updatedAt: new Date("2016"),
      }],
      type: "destroy",
    },
  ]);
});

it("should record update operation", async () => {
  let { sequelize, Item } = define();

  await Item.create({
    description: "Some description",
  });

  let mutations = [];
  sequelize.mock.on("mutation", (mutation) => {
    mutations.push(mutation);
  });

  await Item.update({
    description: 'Some other description',
  }, {
    where: {},
  });

  expect(mutations).toEqual([
    {
      type: 'update',
      collection_name: 'ItemWithDescription',
      items_to_update: [{
        createdAt: new Date("2016"),
        description: "Some other description",
        updatedAt: new Date("2016"),
      }],
      change: {
        description: "Some other description",
      },
    },
  ]);
});
