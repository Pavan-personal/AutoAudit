import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

export default {
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
};

