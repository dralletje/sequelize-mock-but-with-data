let inflection = require("inflection");
// prettier-ignore
let { upperFirst, mapValues, isEmpty, isArray, orderBy, isMatch, fromPairs, escapeRegExp } = require('lodash');
let util = require("util");
let immer = require("immer").default;
let { EventEmitter } = require("events");

const { Datatypes, Shallow } = require("./Datatypes");
const { does_match_where, SequelizeOp } = require("./does_match_where");

// let known = require('./known-but-better-ofcourse.js');
/**
 * @template Identity extends object
 * @type {(x: Identity) => Identity}
 */
let known = (x) => x;
let precondition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

let Object_Reference = Symbol("Reference to the object for internal reference");

let create_default = (definition, { next_id }) => {
  if (typeof definition.defaultValue === "function") {
    return definition.defaultValue();
  }
  if (
    definition.defaultValue &&
    typeof definition.defaultValue.create_default === "function"
  ) {
    return definition.defaultValue.create_default({ next_id });
  }
  if (definition.autoIncrement) {
    return next_id();
  }
  return null;
};

/**
 * @typedef {any} RelationGetterOptions
 * @typedef {any} RelationOptions
 */

// This is necessary to prevent a total reload whenever
// the module that creates the sequelize gets reloaded in my development environment.
// I desperately need to fix this in my development setup, but for now this is here 😅
// I wonder if the root module changes in a jest test suite.
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

let validate_collection_indexes = (indexes) => {
  for (let index of indexes) {
    let { unique, fields, ...unknown_options } = index;

    // prettier-ignore
    precondition(isEmpty(unknown_options), `WIP: Index property not yet understood, only .unique and .fields (got ${JSON.stringify(unknown_options)})`);
  }

  return indexes;
};

/**
 * @template T
 */
class Model {
  /**
   * @param {T} dataValues
   */
  constructor(dataValues) {
    /** @type {any} */
    let variable_to_make_typescript_not_cry = this.constructor;
    /** @type {typeof Model} */
    this.collection = variable_to_make_typescript_not_cry;

    // this.dataValues = known({ ...dataValues });
    this.dataValues = { ...dataValues };
    this[Object_Reference] = dataValues;

    Object.assign(this, dataValues);

    // return known(this);
    return this;
  }

  [util.inspect.custom]() {
    return {
      __table_name__: this.collection.modelName,
      ...this.dataValues,
    };
  }

  toJSON() {
    return {
      __table_name__: this.collection.modelName,
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

  // Static methods from here on
  /**
   * @param {any} fields
   * @param {any} options
   */
  static init(fields, options) {
    let {
      modelName = this.modelName,
      sequelize,
      timestamps = true,
      indexes = [],
      scope,
      ...unknown_options
    } = options;

    // prettier-ignore
    precondition(isEmpty(unknown_options), `WIP: Options not yet... understood (${JSON.stringify(unknown_options)})`);

    // TODO Something with indexes
    // indexes

    this.indexes = validate_collection_indexes(indexes);

    if (sequelize.mock == null) {
      console.log(`database:`, sequelize.mock);
    }

    this.modelName = modelName;
    this.base = sequelize;
    this.singular = upperFirst(inflection.singularize(name));
    this.plural = upperFirst(inflection.pluralize(name));
    this.fields = {
      ...mapValues(fields, (field, key) => {
        return this.__define_field({ field, key });
      }),
    };
    if (timestamps) {
      this.fields = {
        updatedAt: {
          type: Datatypes.DATE,
          defaultValue: Datatypes.NOW,
        },
        createdAt: {
          type: Datatypes.DATE,
          defaultValue: Datatypes.NOW,
        },
        ...this.fields,
      };
    }

    // Internal method
    this.next_id = () => {
      let next_id = sequelize.data.next_id_counter;
      sequelize.data.next_id_counter = sequelize.data.next_id_counter + 1;
      return next_id;
    };
    this.options = options;

    Object.defineProperty(this.prototype, "name", {
      configurable: true,
      writable: true,
      value: `${this.singular}Instance`,
    });
    Object.defineProperty(this, "options", {
      configurable: true,
      writable: true,
      value: this.options,
    });

    this.hooks = {};

    sequelize._registerCollection(modelName, this);
  }

  // Hooks stuff
  static addHook(hook, onHook) {
    this.hooks[hook] = this.hooks[hook] || [];
    this.hooks[hook].push(onHook);
  }

  static get database() {
    let rows = this.base.data.collections.get(this.modelName);
    return rows;
  }
  static set database(value) {
    this.base.data.collections.set(this.modelName, value);
  }

  static async sync({ force = false } = {}) {
    if (force === true) {
      this.database = [];
    }
    return true;
  }

  static [util.inspect.custom]() {
    return {
      name: this.modelName,
      items_in_database: this.database.length,
      // fields: Object.keys(this.fields),
    };
  }

  static __define_field({ key, field }) {
    // TODO Validation?
    // prettier-ignore
    precondition(field != null, `Unknown type set on field '${key}' of model '${this.modelName}'`);
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

  static __emit(mutation) {
    this.base.mock.emit("mutation", {
      ...mutation,
      collection_name: this.modelName,
    });
  }

  static async __get_item(
    dataValues,
    { include: models_to_include = [], transaction = null } = {}
  ) {
    if (dataValues == null) {
      return null;
    }

    let instance = new this(dataValues);
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

        if (include.required) {
          // make sure required true in include of include still works
          if (instance[getter_suffix] && instance[getter_suffix].length === 0) {
            return null;
          }
        }

        if (instance[getter_suffix] == null) {
          return null;
        }
      }
    }
    return instance;
  }

  static async bulkCreate(items) {
    return Promise.all(items.map((item) => this.create(item)));
  }

  static async create(item, { transaction = null } = {}) {
    let unknown_keys = Object.keys(item).filter(
      (key) => this.fields[key] == null
    );
    // prettier-ignore
    precondition(unknown_keys.length === 0, `Unknown fields found in ${this.modelName}.create(): ${unknown_keys.join(', ')}`);

    // Validate options
    let object = mapValues(this.fields, (definition, key) => {
      let value = item[key];
      value = value == null ? null : value;

      if (definition[Shallow] === true) {
        throw new Error("Nu-uh");
      } else {
        value =
          value == null
            ? create_default(definition, { next_id: this.next_id })
            : value;

        // prettier-ignore
        precondition(definition.allowNull || value != null, `Value '${key}' is not allowed to be null`);

        if (value == null) {
          return null;
        } else {
          // prettier-ignore
          precondition(definition.type != null, `Field '${key}' on '${this.modelName}' has invalid type`);

          return definition.type.cast ? definition.type.cast(value) : value;
        }
      }
    });

    if (this.options.timestamps) {
      object.createdAt = object.createdAt || new Date();
      object.updatedAt = object.updatedAt || new Date();
    }

    this.__emit({
      type: "create",
      item: object,
    });
    this.database.push(object);
    return await this.__get_item(object);
  }

  static async destroy({ where = {}, transaction = null } = {}) {
    let old_database = this.database;
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
      type: "destroy",
      items: items_to_remove.map((x) => x.dataValues),
    });
    return old_database.length - this.database.length;
  }

  static async update(updateValues, { where = {}, transaction = null } = {}) {
    precondition(
      where != null,
      `You can't specify an update without a where clause`
    );

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
            precondition(definition.type != null, `Field '${key}' on '${this.modelName}' has invalid type`);

            value =
              value == null
                ? create_default(definition, { next_id: this.next_id })
                : value;
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
        type: "update",
        items_to_update: updated_rows.map((x) => this._identifier(x)),
        change: updateValues,
      });
    }

    return [updated_rows.length, updated_rows];
  }

  static _identifier(item) {
    let fields = Object.entries(this.fields);

    let primary_key = fields.find(([key, type]) => type.primaryKey === true);
    if (primary_key != null) {
      let key = primary_key[0];
      return { [key]: item[key] };
    }

    // TODO Look for unique indexes?
    return item;
  }

  static async upsert(updateValues, { transaction, returning }) {
    // prettier-ignore
    precondition(returning !== true, `'returning' option not yet supported`);

    let unique_fields = Object.entries(this.fields).filter(
      ([_, field]) => field.unique === true
    );
    // prettier-ignore
    precondition(unique_fields.length !== 0, `No unique fields defined on model '${this.modelName}'`);

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

  static async count(options) {
    let items = await this.findAll(options);
    return items.length;
  }

  /** @param {any} options */
  static async findAll({
    where,
    transaction,
    include,
    offset = 0,
    limit = Infinity,
    raw = false,
    attributes = [],
    order,
    ...options
  } = {}) {
    // prettier-ignore
    precondition(isEmpty(options), `(yet) unsupported options passed to .findAll (${Object.keys(options)})`);
    precondition(isArray(attributes), `attributes needs to be an array`);

    let items = (
      await Promise.all(
        this.database
          .filter((item) => {
            let does_match = does_match_where(item, where, this.fields);
            return does_match;
          })
          .map((item) => {
            if (attributes.length) {
              let attr_only_item = {};
              for (let key of Object.keys(item)) {
                if (attributes.includes(key)) {
                  attr_only_item[key] = item[key];
                }
              }
              return attr_only_item;
            }
            return item;
          })
          .map(async (item) => {
            if (raw === true) {
              return item;
            } else {
              return await this.__get_item(item, { include });
            }
          })
      )
    ).filter((x) => Boolean(x));

    if (order) {
      items = orderBy(
        items,
        order.map(([key, order]) => key),
        order.map(([key, order]) => order.toLowerCase())
      );
    }

    return items.slice(offset, limit);
  }

  static async findAndCountAll(options) {
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

  static async findOne(options) {
    // TODO Notice when there are multiple matches here, as you normally don't want that
    let items = await this.findAll(options);
    return items[0];
  }

  static async find(options) {
    return this.findOne(options);
  }

  static async findById(id, options = {}) {
    return this.findOne({ ...options, where: { id, ...options.where } });
  }

  static async findOrCreate(options) {
    // TODO Need to check only unique keys here
    let res = await this.findOne(options);

    if (!res) {
      let created = await this.create(options.where);
      return [created];
    }
    return [res];
  }

  static belongsTo(
    foreignCollection,
    {
      as: getterName = foreignCollection.singular,
      constraints = true,
      foreignKey: foreignKeyPossiblyString = `${getterName}Id`,
      ...unknown_options
    } = {}
  ) {
    let { name: foreignKeyName = `${getterName}Id`, allowNull = true } =
      typeof foreignKeyPossiblyString === "string"
        ? { name: foreignKeyPossiblyString }
        : foreignKeyPossiblyString;

    this.fields[foreignKeyName] = {
      type: foreignCollection.fields.id.type,
      allowNull: Boolean(allowNull),
      primaryKey: false,
      defaultValue: null,
      autoIncrement: null,
    };

    /** @param {RelationGetterOptions} */
    this.prototype[`get${getterName}`] = async function ({
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

  /**
   * @param {typeof Model} foreignCollection
   * @param {RelationOptions} options
   */
  static hasMany(foreignCollection, { scope = {}, ...unknown_options }) {
    let relation_key = `${this.singular}Id`;
    let getterName = foreignCollection.plural;

    foreignCollection.fields[relation_key] = {
      type: this.fields.id.type,
      primaryKey: false,
      allowNull: true,
      defaultValue: null,
      autoIncrement: null,
    };

    // TODO Check `unknown_options`

    /** @param {RelationGetterOptions} options */
    this.prototype[`get${getterName}`] = async function ({
      include,
      transaction,
      where = {},
    } = {}) {
      // `this` here is the Instance, the collection is `this.collection`
      // prettier-ignore
      // precondition(isEmpty(options), `WIP: hasMany(_, options) is not supported yet`);
      // prettier-ignore
      precondition(where[relation_key] == null, `Can't use 'include: { where: { ${relation_key}: ... }}' because that is the key being joined on`);

      let result = await foreignCollection.findAll({
        where: {
          ...scope,
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

  static hasOne(foreignCollection, options) {
    let getterName = foreignCollection.singular;
    let relation_key = `${this.singular}Id`;

    foreignCollection.fields[relation_key] = {
      type: this.fields.id.type,
    };
    /** @param {RelationGetterOptions} options */
    this.prototype[`get${getterName}`] = async function ({
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

  static belongsToMany(foreignCollection, { through, ...unknown_options }) {
    // prettier-ignore
    precondition(through != null, `No 'through' property given to belongsToMany`);

    let getterName = foreignCollection.plural;
    let throughCollection = null;

    // Create or find the proxy collection
    let found = [...this.base.definitions].find(([key, x]) => {
      if (typeof through === "string") {
        return x.plural === through;
      } else {
        return x === through;
      }
    });

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

    /** @param {RelationGetterOptions} options */
    this.prototype[`get${getterName}`] = async function ({
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
    this.__isMock = true;
    this.mock = new SequelizeMockExtension();

    // 'definition' for when we are defining the models
    // 'database' as soon as data gets accessed, and we disallow changes in
    // the definition from then on
    this.url = url;
    this.mode = "definition";
    this.definitions = new Map();

    this.data = database_cache[url] || {
      next_id_counter: 1,
      collections: new Map(),
    };
  }

  __persist() {
    database_cache[this.url] = this.data;
  }

  import(path) {
    let model = require(path)(this, Datatypes);
    return model;
  }

  define(name, fields, options) {
    let MyModel = class extends Model {};
    MyModel.init(fields, { modelName: name, sequelize: this, ...options });
    return MyModel;
  }

  _registerCollection(name, Model) {
    // prettier-ignore
    precondition(this.mode === 'definition', `Can't add model because database is in ${this.mode} mode`);
    // prettier-ignore
    precondition(!this.definitions.has(name), `Model '${name}' already defined`);

    if (this.data.collections.has(name) === false) {
      this.data.collections.set(name, []);
    }

    this.definitions.set(name, Model);

    return Model;
  }

  async authenticate() {
    return true;
  }
  async sync({ force = false } = {}) {
    if (force === true) {
      // prettier-ignore
      this.data.next_id_counter = 1;
      for (let [name, rows] of this.data.collections) {
        this.data.collections.set(name, []);
      }
    }
    return true;
  }

  transaction() {
    return new Transaction();
  }

  // TODO Remove this
  async flush() {
    throw new Error("DEPRECATED: Use `.sync({ force: true })`");
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

Sequelize.Op = SequelizeOp;
Sequelize.Model = Model;

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
