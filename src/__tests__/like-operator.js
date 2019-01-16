let Sequelize = require("sequelize");

let define = () => {
  let sequelize = new Sequelize();
  let Item = sequelize.define("Item", {
    description: Sequelize.STRING,
  });
  return { sequelize, Item };
};

test.each([
  ["% car", "red car", true],
  ["% car", "red truck", false],
  ["car_", "cart", true],
  ["car_", "car", false],
  ["car_", "bus", false],
  ["%car%", "car", true],
  ["%car%", "red car", true],
  ["%car%", "red truck", false],
  ["%car%", "carry on", true],
  ["%car%", "truck", false],
  ["a % car", "a red car", true],
  ["a % car", "a red truck", false],
  ["a % car", "a car", false],
  ["a % car", "a very big car", true],
])(
  "pattern %s will match %s: %p",
  async (pattern, value, matches) => {
    let { sequelize, Item } = define();

    await Item.create({
      description: value,
    });
    let matching_items = await Item.findAll({
      where: {
        description: { [Sequelize.Op.like]: pattern },
      },
    });
    expect(matching_items.length).toBe(matches ? 1 : 0);
  }
);
