import { Injectable } from '@nestjs/common';
import { AxiosResponse } from 'axios';
import { createConnection, Connection } from 'mysql2/promise';
import axios from 'axios';

@Injectable()
export class ApiService {
    private readonly url = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
    private readonly maxRows = 20;
    private readonly tradeTypes = ['SELL', 'BUY'];
    private readonly payTypes = ['Monobank'];

    private async getP2PData(page: number, tradeType: string): Promise<any[]> {
        const requestData = {
            page: page,
            rows: this.maxRows,
            asset: 'USDT',
            fiat: 'UAH',
            tradeType: tradeType,
            payTypes: this.payTypes,
        };

        try {
            const response: AxiosResponse = await axios.post(this.url, requestData);
            if (response.status !== 200) {
                throw new Error(`HTTP Error: ${response.status}`);
            }
            return response.data.data;
        } catch (error) {
            console.error('Error:', error.message);
            throw error;
        }
    }

    async fetchData(): Promise<void> {
        const dbConfig = {
            host: 'localhost',
            user: 'root',
            password: '123456789_qQ',
            database: 'binance',
        };

        const connection: Connection = await createConnection(dbConfig);

        try {
            for (const tradeType of this.tradeTypes) {
                const tableName = `binance_data_${tradeType.toLowerCase()}`;
                await this.createTableIfNotExists(connection, tableName);
                await this.clearTable(connection, tableName);

                let page = 0;
                const rows = [];
                let count = 0;

                while (page < 5 && count < 5) {
                    page += 1;
                    const data = await this.getP2PData(page, tradeType);

                    if (data.length === 0) {
                        break;
                    }

                    for (const item of data) {
                        const advertiserName = item.advertiser.nickName;
                        const price = item.adv.price;

                        if (
                            item.adv.tradeMethods.length == 1 &&
                            item.adv.tradeMethods[0].tradeMethodName === 'Monobank' &&
                            item.adv.maxSingleTransAmount >= 4999
                        ) {
                            rows.push([advertiserName, price]);
                            count += 1;
                        }

                        if (count === 5) {
                            break;
                        }
                    }
                }

                for (const row of rows) {
                    const [advertiserName, price] = row;
                    await connection.execute(`INSERT INTO ${tableName} (advertiserName, price) VALUES (?, ?)`, [
                        advertiserName,
                        price,
                    ]);
                }
            }

        } catch (error) {
            console.error('DB Error', error);
        } finally {
            await connection.end();
        }
    }

    private async createTableIfNotExists(connection: Connection, tableName: string): Promise<void> {
        await connection.execute(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        advertiserName VARCHAR(255),
        price DECIMAL(10, 2)
      )
    `);
    }

    private async clearTable(connection: Connection, tableName: string): Promise<void> {
        await connection.execute(`DELETE FROM ${tableName}`);
    }
}
