let inflection = require("inflection");
// prettier-ignore
let { upperFirst, mapValues, isEmpty, orderBy, isMatch, fromPairs, escapeRegExp } = require('lodash');
let util = require("util");
let immer = require("immer").default;
let { EventEmitter } = require("events");

// let known = require('./known-but-better-ofcourse.js');
let known = x => x;

let Object_Reference = Symbol("Reference to the object for internal reference");
let next_id_counter = 0;
let Shallow = Symbol("Shallow type");
let Datatypes = {
  STRING: {
    [Shallow]: true,
    name: "STRING",
    cast: (x) => {
      return String(x);
    },
  },
  TEXT: {
    [Shallow]: true,
    name: "TEXT",
    cast: (x) => {
      return String(x);
    },
  },
  BOOLEAN: {
    [Shallow]: true,
    name: "BOOLEAN",
    cast: (x) => {
      return Boolean(x);
    },
  },
  JSON: {
    [Shallow]: true,
    name: "JSON",
    // cast?
  },
  JSONB: {
    [Shallow]: true,
    name: "JSONB",
    // cast?
  },
  UUID: {
    [Shallow]: true,
    name: "UUID",
    cast: (x) => {
      // COULD also do uuid conversion here but honestly... honestly?!
      return String(x);
    },
  },
  UUIDV4: {
    [Shallow]: true,
    name: "UUIDV4",
    create_default: () => {
      next_id_counter = next_id_counter + 1;
      // Generate a UUID like just for the feelz
      // (Honestly this is unecessary but idk feels good I guess?)
      // let id = padEnd(`${next_id_counter}`, 32, '0');
      // return `${id.slice(0,8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`;
      return `${next_id_counter}`;
      // return next_id_counter
    },
    cast: (x) => {
      return String(x);
    },
  },
  NOW: {
    [Shallow]: true,
    name: "NOW",
    create_default: () => {
      return Date.now();
    },
    cast: (x) => {
      // prettier-ignore
      throw new Error(`Sequelize.NOW is not usable as type`);
    },
  },
  INTEGER: {
    [Shallow]: true,
    name: "INTEGER",
    cast: (x) => {
      // prettier-ignore
      precondition(x !== '', `Tried to use an empty string as INTEGER`);

      let result = Number(x);

      // prettier-ignore
      precondition(Number.isInteger(result), `Tried to use '${x}' as INTEGER, but it aint (${result})`);

      return result;
    },
  },
  DECIMAL: {
    [Shallow]: true,
    name: "DECIMAL",
    cast: (x) => {
      // prettier-ignore
      precondition(x !== '', `Tried to use an empty string as DECIMAL`);

      let result = Number(x);

      // prettier-ignore
      precondition(Number.isFinite(result), `Tried to use '${x}' as DECIMAL, but it aint (${result})`);

      return result;
    },
  },
  DATE: {
    [Shallow]: true,
    name: "DATE",
    cast: (x) => {
      return new Date(x);
    },
  },
  ENUM: {
    [Shallow]: true,
    name: "ENUM",
    // cast?
  },
  BLOB: {
    [Shallow]: true,
    name: "BLOB",
  },
};

let create_default = (definition) => {
  if (typeof definition.defaultValue === "function") {
    return definition.defaultValue();
  }
  if (
    definition.defaultValue &&
    typeof definition.defaultValue.create_default === "function"
  ) {
    return definition.defaultValue.create_default();
  }
  if (definition.autoIncrement) {
    next_id_counter = next_id_counter + 1;
    return next_id_counter;
  }
  return null;
};

// This is necessary to prevent a total reload whenever
// the module that creates the sequelize gets reloaded in dev
let find_parent_module = (module) => {
  if (module.parent == null) {
    return module;
  } else {
    if (module.parent === module) {
      return {};
    }
    return find_parent_module(module.parent);
  }
};
let root_module = find_parent_module(module);
root_module.database_cache = root_module.database_cache || {};
let database_cache = root_module.database_cache;

let precondition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

class DefaultModel {
  constructor(dataValues, collection) {
    this.collection = collection;
    this.dataValues = known({ ...dataValues });
    // this.dataValues = { ...dataValues };
    this[Object_Reference] = dataValues;

    Object.assign(this, dataValues);

    return known(this);
  }

  [util.inspect.custom]() {
    return {
      __table_name__: this.collection.name,
      ...this.dataValues,
    };
  }

  toJSON() {
    return {
      __table_name__: this.collection.name,
      ...this.dataValues,
    };
  }

  save() {
    // prettier-ignore
    throw new Error(`Try using 'Model.update(...)' instead of 'instance.save()'`);
  }
  destroy() {
    // prettier-ignore
    throw new Error(`Try using 'Model.destroy(...)' instead of 'instance.destroy()'`);
  }

  // get then() {
  //   return undefined;
  // }
  // get asymmetricMatch() {
  //   return undefined;
  // }
  // get $$typeof() {
  //   return undefined;
  // }
}

let generate_like_regex = (pattern) => {
  return new RegExp(
    escapeRegExp(pattern)
      .replace(/%/g, ".*")
      .replace(/_/g, ".")
  );
};

// { count: 10, age: { [Op.lt]: 18 } }
// - special_matchers(item.count, 10)
// - special_matchers(item.age, { [Op.iLike]: 18 })
let special_matchers = (item, matchobject) => {
  if (typeof matchobject !== "object") {
    return item === matchobject;
  }
  if (matchobject === null) {
    return item === matchobject;
  }

  return Object.getOwnPropertySymbols(matchobject).every((symbol) => {
    if (symbol === Sequelize.Op.or) {
      let queries = matchobject[Sequelize.Op.or];

      precondition(queries != null, `Value to [Op.or] is null or undefined`);

      if (Array.isArray(queries)) {
        if (queries.length === 0) {
          return true;
        } else {
          return queries.some((query) => {
            return special_matchers(item, query);
          });
        }
      } else {
        // console.warn(`I really think it is better to use [Or.or]: <array>`)
        return Object.getOwnPropertySymbols(queries).some((symbol) => {
          return special_matchers(item, { [symbol]: queries[symbol] });
        });
      }
    }

    if (symbol === Sequelize.Op.and) {
      let queries = arrayisze_object(matchobject[Sequelize.Op.and]);
      if (queries.length === 0) {
        return true;
      } else {
        return queries.every((query) => {
          return special_matchers(item, query);
        });
      }
    }

    if (symbol === Sequelize.Op.contains) {
      let array = matchobject[Sequelize.Op.contains];

      // prettier-ignore
      precondition(Array.isArray(array), `Op.contains without array inside.. not sure what to do`);
      // prettier-ignore
      precondition(array.length === 1, `Op.contains needs an array with one element, for now`);

      // TODO make sure that item *has* to be an array, and can't be null
      // prettier-ignore
      precondition(Array.isArray(item), `Op.contains can not be applied to a non-array`);

      let match_frame = array[0];
      return item.some((x) => isMatch(x, match_frame));
    }
    if (symbol === Sequelize.Op.eq) {
      return item === matchobject[Sequelize.Op.eq];
    }
    if (symbol === Sequelize.Op.ne) {
      return item !== matchobject[Sequelize.Op.ne];
    }
    if (symbol === Sequelize.Op.gte) {
      return item >= matchobject[Sequelize.Op.gte];
    }
    if (symbol === Sequelize.Op.gt) {
      return item > matchobject[Sequelize.Op.gt];
    }
    if (symbol === Sequelize.Op.lte) {
      return item <= matchobject[Sequelize.Op.lte];
    }
    if (symbol === Sequelize.Op.lt) {
      return item < matchobject[Sequelize.Op.lt];
    }
    if (symbol === Sequelize.Op.in) {
      return matchobject[Sequelize.Op.in].includes(item);
    }
    if (symbol === Sequelize.Op.between) {
      let [lowerbound, upperbound] = matchobject[Sequelize.Op.between];
      return lowerbound < item && item < upperbound;
    }
    if (symbol === Sequelize.Op.iLike) {
      if (item == null) {
        return false;
      }

      let ilike_pattern = matchobject[Sequelize.Op.iLike].toLowerCase();
      return generate_like_regex(ilike_pattern).test(item.toLowerCase());
    }
    if (symbol === Sequelize.Op.like) {
      if (item == null) {
        return false;
      }

      let like_pattern = matchobject[Sequelize.Op.like];
      return generate_like_regex(like_pattern).test(item);
    }

    throw new Error(`Implement symbol '${String(symbol)}'`);
  });
};

// [] => []
// [1, 2, 3] => [1, 2, 3]
// {} => []
// { key: 'value' } => [{ key: 'value' }]
// { key1: 'value', key2: 'value' } => [{ key1: 'value' }, { key2: 'value' }];
let arrayisze_object = (array_or_object) => {
  if (Array.isArray(array_or_object)) {
    return array_or_object;
  } else {
    let symbols = Object.getOwnPropertySymbols(array_or_object);
    let keys = Object.keys(array_or_object);
    return [...symbols, ...keys].map((key) => {
      return { [key]: array_or_object[key] };
    });
  }
};

let does_match_where = (item, where, fields) => {
  // No query, so everything passes!!!
  if (where === undefined) {
    return true;
  }

  // prettier-ignore
  precondition(where !== null, `Explicitly passed in 'null' to 'where: ...', you sure?`);
  // prettier-ignore
  precondition(typeof where === 'object', `where object is... not an object: '${where}'`);

  if (where[Sequelize.Op.and] != null) {
    let and_predicates = arrayisze_object(where[Sequelize.Op.and]);
    let and_match = and_predicates.every((predicate) => {
      return does_match_where(item, predicate, fields);
    });

    if (and_match === false) {
      return false;
    }
  }

  if (where[Sequelize.Op.or] != null) {
    let or_predicates = arrayisze_object(where[Sequelize.Op.or]);

    let or_match = or_predicates.some((predicate) => {
      return does_match_where(item, predicate, fields);
    });

    if (or_match === false) {
      return false;
    } else {
      // Continue with the normal predicates
    }
  }

  let predicates = Object.entries(where);
  return predicates.every(([key, predicate]) => {
    // Make sure that every key in the where clause actually exists
    let field = fields[key];
    precondition(
      field != null,
      `Querying on key '${key}', but it is not defined in the model`
    );

    // TODO Have some casts throw with edgy values
    // let { cast = (x => x) } = field.type;
    // let value = cast(item[key]);
    let value = item[key];

    return special_matchers(value, predicate);
  });
};

class Collection {
  constructor({
    name,
    fields,
    options: { indexes, ...options } = {},
    database,
  }) {
    // prettier-ignore
    precondition(isEmpty(options), `WIP: Options not yet... understood (${JSON.stringify(options)})`);

    // TODO Something with indexes
    // indexes

    this.name = name;
    if (database.mock == null) {
      console.log(`database:`, database.mock);
    }

    this.base = database;
    this.singular = upperFirst(inflection.singularize(name));
    this.plural = upperFirst(inflection.pluralize(name));
    this.fields = {
      updatedAt: {
        type: Datatypes.DATE,
        primaryKey: false,
        allowNull: false,
        defaultValue: Datatypes.NOW,
        autoIncrement: null,
      },
      createdAt: {
        type: Datatypes.DATE,
        primaryKey: false,
        allowNull: false,
        defaultValue: Datatypes.NOW,
        autoIncrement: null,
      },
      ...mapValues(fields, (field, key) => {
        return this.__define_field({ field, key });
      }),
    };

    this.options = options;

    this.database = [];

    this.Model_Class = class Model extends DefaultModel {};
    Object.defineProperty(this.Model_Class, "name", {
      configurable: true,
      writable: true,
      value: `${this.singular}Instance`,
    });
  }

  async sync({ force = false } = {}) {
    if (force === true) {
      this.__;
      this.database = [];
    }
    return true;
  }

  [util.inspect.custom]() {
    return {
      name: this.name,
      items_in_database: this.database.length,
      // fields: Object.keys(this.fields),
    };
  }

  __define_field({ key, field }) {
    // TODO Validation?
    // prettier-ignore
    precondition(field != null, `Unknown type set on field '${key}' of model '${this.name}'`);
    if (field[Shallow] === true) {
      // Shorthand with only type definition, so need to expand
      return {
        type: field,
        primaryKey: false,
        allowNull: true,
        // TODO Quite sure there is no need to explicitly set these...
        // .... But doing it anyway 😎
        defaultValue: null,
        autoIncrement: null,
      };
    } else {
      return {
        primaryKey: false,
        allowNull: true,
        defaultValue: null,
        autoIncrement: null,
        ...field,
      };
    }
  }

  __emit(mutation) {
    this.base.mock.emit('mutation', {
      ...mutation,
      collection_name: this.name,
    });
  }

  async __get_item(
    dataValues,
    { include: models_to_include = [], transaction } = {}
  ) {
    if (dataValues == null) {
      return null;
    }

    let instance = new this.Model_Class(dataValues, this);
    for (let include of models_to_include) {
      if (include.as) {
        // prettier-ignore
        precondition(instance[`get${include.as}`] != null, `No getter/relation defined for '${include.as}'`);
        // prettier-ignore
        precondition(typeof instance[`get${include.as}`] === 'function', `Getter '${include.as}' is not actually a function... which is very weird`);

        await instance[`get${include.as}`]({
          include: include.include,
          where: include.where,
          transaction: transaction,
        });

        if (instance[include.as] == null) {
          return null;
        }
      } else {
        let valid_getter_suffix = [
          include.model.singular,
          include.model.plural,
        ].filter((x) => typeof instance[`get${x}`] === "function");

        // prettier-ignore
        precondition(valid_getter_suffix.length !== 0, `No relations defined for '${include.model.name}'`);
        // prettier-ignore
        precondition(valid_getter_suffix.length === 1, `Multiple relations defined for model '${include.model.name}'`);
        let getter_suffix = valid_getter_suffix[0];


        await instance[`get${getter_suffix}`]({
          include: include.include,
          where: include.where,
          transaction,
        });

        if (instance[getter_suffix] == null) {
          return null;
        }
      }
    }
    return instance;
  }

  async bulkCreate(items) {
    return Promise.all(items.map((item) => this.create(item)));
  }

  async create(item) {
    let unknown_keys = Object.keys(item).filter(
      (key) => this.fields[key] == null
    );

    // prettier-ignore
    precondition(unknown_keys.length === 0, `Unknown fields found in ${this.name}.create(): ${unknown_keys.join(', ')}`);

    // Validate options
    let object = mapValues(this.fields, (definition, key) => {
      let value = item[key];
      value = value == null ? null : value;

      if (definition[Shallow] === true) {
        throw new Error("Nu-uh");
      } else {
        value = value == null ? create_default(definition) : value;

        // prettier-ignore
        precondition(definition.allowNull || value != null, `Value '${key}' is not allowed to be null`);

        if (value == null) {
          return null;
        } else {
          // prettier-ignore
          precondition(definition.type != null, `Field '${key}' on '${this.name}' has invalid type`);

          return definition.type.cast ? definition.type.cast(value) : value;
        }
      }
    });

    object.createdAt = object.createdAt || new Date();
    object.updatedAt = object.updatedAt || new Date();

    this.__emit({
      type: 'create',
      item: object,
    });
    this.database.push(object);
    return await this.__get_item(object);
  }

  async destroy({ where, transaction } = {}) {
    let initial_length = this.database.length;
    let items_to_remove = await this.findAll({
      where: where,
      transaction: transaction,
    });
    this.database = this.database.filter((item) => {
      return (
        items_to_remove.find((to_remove) => {
          return to_remove[Object_Reference] === item;
        }) == null
      );
    });
    this.__emit({
      type: 'destroy',
      items: items_to_remove.map(x => x.dataValues),
    })
    return initial_length - this.database.length;
  }

  async update(updateValues, { where, transaction } = {}) {
    precondition(where != null, `You can't specify an update without a where clause`);

    // TODO Implement check on `updateValues` to know the values exist
    let updated_rows = [];
    this.database = this.database.map((item) => {
      if (does_match_where(item, where, this.fields)) {
        let updated_value = immer(item, (u) => {
          u.updatedAt = new Date();
          for (let [key, value] of Object.entries(updateValues)) {
            // prettier-ignore
            precondition(!key.includes('.'), `Dot syntax '${key}' really doesn't work`);

            let definition = this.fields[key];

            // prettier-ignore
            precondition(definition != null, `Unknown key '${key}' found`);
            // prettier-ignore
            precondition(definition.type != null, `Field '${key}' on '${this.name}' has invalid type`);

            value = value == null ? create_default(definition) : value;
            // prettier-ignore
            precondition(definition.allowNull || value != null, `Value '${key}' is not allowed to be null`);

            if (value != null) {
              value = definition.type.cast
                ? definition.type.cast(value)
                : value;
            }

            u[key] = value;
          }
        });
        updated_rows.push(updated_value);
        return updated_value;
      } else {
        return item;
      }
    });

    if (updated_rows.length !== 0) {
      this.__emit({
        type: 'update',
        items_to_update: updated_rows.map(x => this._identifier(x)),
        change: updateValues,
      });
    }

    return [updated_rows.length, updated_rows];
  }

  _identifier(item) {
    let fields = Object.entries(this.fields);

    let primary_key = fields.find(([key, type]) => type.primaryKey === true);
    if (primary_key != null) {
      let key = primary_key[0];
      return { [key]: item[key] }
    }

    // TODO Look for unique indexes?
    return item;
  }

  async upsert(updateValues, { transaction, returning }) {
    // prettier-ignore
    precondition(returning !== true, `'returning' option not yet supported`);

    let unique_fields = Object.entries(this.fields).filter(
      ([_, field]) => field.unique === true
    );
    // prettier-ignore
    precondition(unique_fields.length !== 0, `No unique fields defined on model '${this.name}'`);

    let unique_updates = unique_fields
      .filter(([key, _]) => {
        return updateValues[key] != null;
      })
      .map(([key, _]) => {
        return [key, updateValues[key]];
      });

    // prettier-ignore
    precondition(unique_updates.length !== 0, `No unique fields in the update values`);
    let where = fromPairs(unique_updates);

    let found = await this.findOne({
      where: where,
      transaction,
    });

    if (found) {
      await this.update(updateValues, {
        where: {
          id: found.id,
        },
        transaction,
      });
      return false;
    } else {
      await this.create(updateValues, { transaction });
      return true;
    }
  }

  async count(options) {
    let items = await this.findAll(options);
    return items.length;
  }

  async findAll({
    where,
    transaction,
    include,
    offset = 0,
    limit = Infinity,
    order,
    ...options
  } = {}) {
    // prettier-ignore
    precondition(isEmpty(options), `(yet) unsupported options passed to .findAll (${Object.keys(options)})`);

    let items = (await Promise.all(
      this.database
        .filter((item) => {
          let does_match = does_match_where(item, where, this.fields);
          return does_match;
        })
        .map(async (item) => await this.__get_item(item, { include }))
    )).filter((x) => Boolean(x));

    if (order) {
      items = orderBy(
        items,
        order.map(([key, order]) => key),
        order.map(([key, order]) => order.toLowerCase())
      );
    }

    return items.slice(offset, limit);
  }

  async findAndCountAll(options) {
    let real_options = {
      ...options,
      offset: 0,
      limit: Infinity,
    };

    let offset = options.offset || 0;
    let limit = options.limit || 0;

    let items = await this.findAll(real_options);

    return {
      rows: items.slice(offset, limit + 1),
      count: items.length,
    };
  }

  async findOne(options) {
    // TODO Notice when there are multiple matches here, as you normally don't want that
    let items = await this.findAll(options);
    return items[0];
  }

  async find(options) {
    return this.findOne(options);
  }

  async findById(id, options = {}) {
    return this.findOne({ ...options, where: { id, ...options.where } });
  }

  async findOrCreate(options) {
    // TODO Need to check only unique keys here
    let res = await this.findOne(options);

    if (!res) {
      let created = await this.create(options.where);
      return [created];
    }
    return [res];
  }

  belongsTo(
    foreignCollection,
    {
      as: getterName = foreignCollection.singular,
      constraints = true,
      foreignKey = `${getterName}Id`,
      ...unknown_options
    } = {}
  ) {
    if (typeof foreignKey === "string") {
      foreignKey = { name: foreignKey };
    }

    let {
      name: foreignKeyName = `${getterName}Id`,
      allowNull = true,
    } = foreignKey;

    this.fields[foreignKeyName] = {
      type: foreignCollection.fields.id.type,
      allowNull: Boolean(allowNull),
      primaryKey: false,
      defaultValue: null,
      autoIncrement: null,
    };
    this.Model_Class.prototype[`get${getterName}`] = async function({
      transaction,
      include,
      where = {},
    } = {}) {
      // prettier-ignore
      precondition(isEmpty(unknown_options), `WIP: belongsTo(_, options) is not supported yet (${Object.keys(unknown_options).join(', ')})`);
      // prettier-ignore
      precondition(where.id == null, `Can't use 'include: { where: { id: ... }}' because that is the key being joined on`);

      let result = await foreignCollection.findOne({
        where: {
          ...where,
          id: this.dataValues[foreignKeyName],
        },
        include,
        transaction,
      });
      this.dataValues[getterName] = result;
      this[getterName] = result;
      return result;
    };
  }

  hasMany(foreignCollection, options) {
    let relation_key = `${this.singular}Id`;
    let getterName = foreignCollection.plural;

    foreignCollection.fields[relation_key] = {
      type: this.fields.id.type,
      primaryKey: false,
      allowNull: true,
      defaultValue: null,
      autoIncrement: null,
    };
    this.Model_Class.prototype[`get${getterName}`] = async function({
      include,
      transaction,
      where = {},
    } = {}) {
      // `this` here is the Instance, the collection is `this.collection`
      // prettier-ignore
      precondition(isEmpty(options), `WIP: hasMany(_, options) is not supported yet`);
      // prettier-ignore
      precondition(where[relation_key] == null, `Can't use 'include: { where: { ${relation_key}: ... }}' because that is the key being joined on`);

      let result = await foreignCollection.findAll({
        where: {
          [relation_key]: this.dataValues.id,
          ...where,
        },
        include,
        transaction,
      });
      this.dataValues[getterName] = result;
      this[getterName] = result;
      return result;
    };
  }

  hasOne(foreignCollection, options) {
    let getterName = foreignCollection.singular;
    let relation_key = `${this.singular}Id`;

    foreignCollection.fields[relation_key] = {
      type: this.fields.id.type,
    };
    this.Model_Class.prototype[`get${getterName}`] = async function({
      transaction,
      include,
      where = {},
    } = {}) {
      // `this` here is the Instance, the collection is `this.collection`
      // prettier-ignore
      precondition(isEmpty(options), `WIP: hasOne(_, options) is not supported yet`);
      // prettier-ignore
      precondition(where[relation_key] == null, `Can't use 'include: { where: { ${relation_key}: ... }}' because that is the key being joined on`);

      let result = await foreignCollection.findOne({
        where: {
          ...where,
          [relation_key]: this.dataValues.id,
        },
        transaction,
        include,
      });
      this.dataValues[getterName] = result;
      this[getterName] = result;
      return result;
    };
  }

  belongsToMany(foreignCollection, { through, ...unknown_options }) {
    // prettier-ignore
    precondition(through != null, `No 'through' property given to belongsToMany`);

    let getterName = foreignCollection.plural;
    let throughCollection = null;

    // Create or find the proxy collection
    let found = [...this.base.definitions].find(
      ([key, x]) => {
        if (typeof through === "string") {
          return x.plural === through;
        } else {
          return x === through;
        }
      }
    );

    if (found == null) {
      throughCollection = this.base.define(through, {
        [`${this.singular}Id`]: this.fields.id.type,
        [`${foreignCollection.singular}Id`]: foreignCollection.fields.id.type,
      });
    } else {
      throughCollection = found[1];
      throughCollection.fields = {
        ...throughCollection.fields,
        [`${this.singular}Id`]: this.__define_field({
          key: `${this.singular}Id`,
          field: this.fields.id.type,
        }),
        [`${foreignCollection.singular}Id`]: this.__define_field({
          key: `${foreignCollection.singular}Id`,
          field: foreignCollection.fields.id.type,
        }),
      };
    }

    this.Model_Class.prototype[`get${getterName}`] = async function({
      include,
      transaction,
      where = {},
    } = {}) {
      // `this` here is the Instance, the collection is `this.collection`
      // prettier-ignore
      precondition(isEmpty(unknown_options), `WIP: belongsToMany(_, options) is not supported yet`);
      // prettier-ignore
      precondition(where.id == null, `Can't use 'include: { where: { id: ... }}' because that is the key being joined on`);

      let other_ids = await throughCollection.findAll({
        where: {
          [`${this.collection.singular}Id`]: this.dataValues.id,
        },
        transaction,
      });

      let results = other_ids.map(async (id) => {
        return await foreignCollection.findOne({
          where: {
            ...where,
            id: id.id,
          },
          transaction,
          include,
        });
      });
      this.dataValues[getterName] = results;
      this[getterName] = results;
      return results;
    };
  }
}

class Transaction {
  async commit() {}

  async rollback() {}
}

class SequelizeMockExtension extends EventEmitter {}

class Sequelize {
  constructor(url, ...args) {
    // TODO Ugly and hacky >_>
    if (database_cache[url]) {
      return database_cache[url];
    }

    this.__isMock = true;
    this.mock = new SequelizeMockExtension();

    // 'definition' for when we are defining the models
    // 'database' as soon as data gets accessed, and we disallow changes in
    // the definition from then on
    this.url = url;
    this.mode = "definition";
    this.definitions = new Map();
    this.data = new Map();
  }

  __persist() {
    database_cache[this.url] = this;
  }

  import(path) {
    let model = require(path)(this, Datatypes);
    return model;
  }

  define(name, fields, options) {
    // prettier-ignore
    precondition(this.mode === 'definition', `Can't add model because database is in ${this.mode} mode`);
    // prettier-ignore
    precondition(!this.definitions.has(name), `Model '${name}' already defined`);

    let collection = new Collection({
      name: name,
      fields: fields,
      options: options,
      database: this,
    });

    this.definitions.set(name, collection);
    this.data.set(name, []);

    return collection;
  }

  async authenticate() {
    return true;
  }
  async sync({ force = false } = {}) {
    if (force === true) {
      // prettier-ignore
      next_id_counter = 0;
      for (let [key, value] of this.definitions) {
        await value.destroy();
      }
    }
    return true;
  }

  transaction() {
    return new Transaction();
  }

  // TODO Remove this
  async flush() {
    await this.sync({ force: true });
  }

  getQueryInterface() {
    return {};
  }

  isDefined(table) {
    // NOTE Dirty fix for migrations
    if (table === "SequelizeMeta") {
      return true;
    }

    return this.definitions.has(table);
  }
}

Sequelize.Op = {
  and: Symbol("Sequelize [and]"),
  or: Symbol("Sequelize [or]"),
  ne: Symbol("Sequelize [ne]"),
  in: Symbol("Sequelize [in]"),
  between: Symbol("Sequelize [between]"),
  eq: Symbol("Sequelize [eq]"),
  gt: Symbol("Sequelize [gt]"),
  gte: Symbol("Sequelize [gte]"),
  lt: Symbol("Sequelize [lt]"),
  lte: Symbol("Sequelize [lte]"),
  contains: Symbol("Sequelize [contains]"),
  iLike: Symbol("Sequelize [iLike]"),
  like: Symbol("Sequelize [like]"),
};

let OperationSymbol = Symbol("Operation type");

Object.assign(Sequelize, {
  ...Datatypes,
  col: (column_name) => {
    return { [OperationSymbol]: { type: "col", column_name } };
  },
  cast: (value, type) => {
    return { [OperationSymbol]: { type: "cast", value, cast_type: type } };
  },
  where: (value, predicate) => {
    return { [OperationSymbol]: { type: "where", value, predicate } };
  },
  literal: (query) => {
    return { [OperationSymbol]: { type: "literal", query: query } };
  },
});
module.exports = Sequelize;
