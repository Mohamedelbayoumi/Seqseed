#!/usr/bin/env node
const fs = require("fs/promises");
const { exec } = require("child_process");
const util = require("util");
const pico = require("picocolors");
const { select, confirm } = require("@inquirer/prompts");


const path = "./src/database-seeder";

const execPromise = util.promisify(exec);


async function chooseTheDialect() {
  const options = [
    { name: "mysql", value: "mysql" },
    { name: "postgres", value: "postgres" },
    { name: "db2", value: "db2" },
    { name: "mariadb", value: "mariadb" },
    { name: "mssql", value: "mssql" },
    { name: "oracle", value: "oracle" },
    { name: "snowflake", value: "snowflake" },
    { name: "sqlite", value: "sqlite" },
  ];

  return await select({
    message: "Please choose The desired Database:",
    choices: options,
    loop: false,
  });
}

async function setFilesContent(selectedDialect) {
  const mainFileContent = `import { NestFactory } from '@nestjs/core';
import { SeederModule } from './seeder.module';
import { SeederService } from './seeder.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(SeederModule);
  const seederService = app.get(SeederService);

  seederService.createAdminUser();

  await app.close();
}
bootstrap();

`;

  const moduleFileContentWithoutConfig = `import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigModule } from '@nestjs/config';
import { SeederService } from './seeder.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    SequelizeModule.forRoot({
      dialect: '${selectedDialect}',
      host: process.env.DATABASE_HOST,
      port: +process.env.DATABASE_PORT,
      username: process.env.DATABASE_USERNAME,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      autoLoadModels: true,
    }),
  ],
  providers: [SeederService],
})
export class SeederModule {}

`;

  const moduleFileContentWithConfig = `import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SeederService } from './seeder.service';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configSerivce: ConfigService) => ({
        dialect: '${selectedDialect}',
        host: configSerivce.get('DATABASE_HOST'),
        port: configSerivce.get('DATABASE_PORT'),
        username: configSerivce.get('DATABASE_USERNAME'),
        password: configSerivce.get('DATABASE_PASSWORD'),
        database: configSerivce.get('DATABASE_NAME'),
        autoLoadModels: true,
      }),
      inject: [ConfigService],
    }),
    ConfigModule.forRoot(),
  ],
  providers: [SeederService],
})
export class SeederModule {}

  `;

  const serviceFileContent = `import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Sequelize } from 'sequelize-typescript';
import { QueryInterface } from 'sequelize';

@Injectable()
export class SeederService {
  private queryInterface: QueryInterface;

  constructor(
    private configService: ConfigService,
    private sequelize: Sequelize,
  ) {
    this.queryInterface = sequelize.getQueryInterface();
  }

  // example to seed the database with an admin user
  async createAdminUser() {
    await this.queryInterface.bulkInsert('Users', [
      {
        email: this.configService.get('ADMIN_EMAIL'),
        password: this.configService.get('ADMIN_PASSWORD'),
        role: 'admin',
      },
    ]);
  }
}
`;

  const files = [
    {
      name: path + "/seeder.ts",
      content: mainFileContent,
    },
    {
      name: path + "/seeder.module.ts",
      content: (await checkUsingConfigModule())
        ? moduleFileContentWithConfig
        : moduleFileContentWithoutConfig,
    },
    {
      name: path + "/seeder.service.ts",
      content: serviceFileContent,
    },
  ];

  return files;
}

async function checkUsingConfigModule() {
  return await confirm({
    message:
      "Do you want to use config module to load the environment database variables ?",
  });
}

async function findPathForMainFile() {
  let path = "src/database-seeder/seeder.ts";

  const dir = await fs.opendir("./src");

  for await (const dirent of dir) {
    if (dirent.name === "database-seeder") {
      break;
    } else if (!dirent.isFile()) {
      const subDir = await fs.opendir(`./src/${dirent.name}`);
      for await (const subDirent of subDir) {
        if (subDirent.name === "database-seeder") {
          path = `src/${dirent.name}/database-seeder/seeder.ts`;
          break;
        }
      }
    }
  }
  return path;
}


(async () => {
  if (process.argv[2] === "init") {
    try {
      const selectedDialect = await chooseTheDialect();

      const files = await setFilesContent(selectedDialect);

      await fs.mkdir(path, { recursive: true });

      const filePromises = files.map(async (file) => {
        return await fs.writeFile(file.name, file.content);
      });

      await Promise.all(filePromises);

      console.log(pico.green("Seeder Folder Created Successfully 😊"));
    } catch (err) {
      console.error(err.message);
    }
  } else if (process.argv[2] === "run") {
    try {

      const path = await findPathForMainFile()

      const { stderr } = await execPromise(`npx ts-node ${path}`);

      if (stderr) {
        console.error(pico.red(`Command stderr: ${stderr}`));
        return;
      }

      console.log(pico.green("The Seeding Process Finished Successfully 😊"))

    } catch (error) {
      console.error(pico.red(error));
    }
  } else {
    console.log(
      pico.red(
        `oops, you may run a wrong command. There are only two allowed commands:
            1. seqseed init   =>    create folder & files
            2. seqseed run    =>    seed the database with data`
      )
    );
  }
})();
