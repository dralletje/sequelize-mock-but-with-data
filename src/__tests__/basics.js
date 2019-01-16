let Sequelize = require('sequelize');

let define = () => {
  let sequelize = new Sequelize();
  let User = sequelize.define('User', {
    name: Sequelize.STRING,
    email: Sequelize.STRING,
    age: Sequelize.INTEGER,
    verified: Sequelize.BOOLEAN,
  });
  return { sequelize, User };
}

it('should work with simple insert', async () => {
  let { sequelize, User } = define();

  let inserted = await User.create({
    name: 'Michiel Dral',
    email: 'm.c.dral@gmail.com',
    age: 22,
    verified: true,
  });

  expect(inserted).toMatchSnapshot();
});
