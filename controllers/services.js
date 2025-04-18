const axios = require("axios");
const models = require("../models/models"); // Путь к модели
const { recover } = require("./compositions");
const fs = require("fs");

const baseUrl =
    "http://cris.icc.ru/dataset/list?f=185&count_rows=true&iDisplayStart=0&iDisplayLength=";

const createBaseUrl = (displayStart, displayLength) => {
    return `http://cris.icc.ru/dataset/list?f=185&count_rows=true&unique=undefined&count_rows=1&iDisplayStart=${displayStart}&iDisplayLength=${
        displayStart + displayLength
    }`;
};

const getMinMaxId = async () => {
    try {
        const maxId = await models.Service.max("id");
        const minId = await models.Service.min("id");
        console.log("Max ID:", maxId);
        console.log("Min ID:", minId);
        return { minId, maxId };
    } catch (error) {
        console.error("Error fetching or saving data:", error);
    }
};
const updateServices = async (req, res) => {
    const requestData = {
        sort: [{ fieldname: "id", dir: false }],
    };

    let displayLength = 1;

    const serviceWithMaxIdInRemoteServer = await axios
        .post(`${baseUrl}${displayLength}`, requestData)
        .then((response) => response.data)
        .catch((err) => console.log(err));

    const minMaxIdInDataBase = await getMinMaxId();

    const totalRecords = +serviceWithMaxIdInRemoteServer.iTotalDisplayRecords;

    const serviceData = await models.Service.findAll();

    try {
        const displayLength = 100;
        let iDisplayStart = 0;
        let counter = 1;

        while (iDisplayStart < totalRecords) {
            console.log("services update counter", counter);
            const requestUrl = createBaseUrl(iDisplayStart, displayLength);

            const response = await axios.post(requestUrl, requestData);
            const data = response.data.aaData;

            if (data.length === 0) {
                console.log("services data пустая");
                break;
            }
            for (const item of data) {
                // // Проверяем, существует ли запись с таким же 'id' в базе данных
                // const existingService = serviceData.find((dbItem) => dbItem.id === item.id);

                // if (!existingService) {
                //   // Если записи нет, то добавляем ее в базу данных

                // }
                await models.Service.findOrCreate({
                    where: { id: item.id },
                    defaults: {
                        id: item.id,
                        name: item.name,
                        subject: item.subject,
                        type: item.type,
                        description: item.description,
                        actionview: item.actionview,
                        actionmodify: item.actionmodify,
                        map_reduce_specification: item.map_reduce_specification,
                        params: item.params,
                        js_body: item.js_body,
                        wpsservers: item.wpsservers,
                        wpsmethod: item.wpsmethod,
                        status: item.status,
                        output_params: item.output_params,
                        wms_link: item.wms_link,
                        wms_layer_name: item.wms_layer_name,
                        is_deleted: item.is_deleted,
                        created_by: item.created_by,
                        edited_by: item.edited_by,
                        edited_on: item.edited_on,
                        created_on: item.created_on,
                        classname: item.classname,
                    },
                });
            }

            iDisplayStart += displayLength;

            if (data.length < displayLength) {
                console.log("services закончились");
                break;
            }
        }

        console.log("Data synchronization completed.");
    } catch (error) {
        console.error("Error during data synchronization:", error);
        throw error;
    }
};

const getServices = async (req, res) => {
    console.log("getted services");
    let serviceData;
    try {
        if (req.query.user) {
            serviceData = await models.Service.findAll({
                subQuery: false,
                ...(req.query.limit && { limit: req.query.limit }),
                include: {
                    model: models.UserService,
                    where: {
                        user_id: req.query.user,
                    },
                    attributes: ["number_of_calls"],
                },
                order: [
                    [
                        {
                            model: models.UserService,
                        },
                        "number_of_calls",
                        "DESC",
                    ],
                ],
            });
        } else {
            console.log(recover);
            await recover();
            serviceData = await models.Service.findAll({
                order: [["id", "DESC"]],
            });
        }

        res.send(serviceData);
        console.log("Service data from the database:", serviceData.length);
    } catch (error) {
        console.error("Error fetching data from the database:", error);
        throw error;
    }
};

//  function deleteAllServices() {
//     try {
//         // Удалить все записи из таблицы Service
//         await models.Service.destroy({
//             where: {},
//             truncate: true, // Очистить таблицу полностью
//         });

//         console.log("Все записи в таблице Service удалены.");
//     } catch (error) {
//         console.error("Ошибка при удалении записей из таблицы Service:", error);
//     }
// }

const getRecomendations = async (req, res) => {
    try {
        console.log("recomendations");
        const { spawn } = require("child_process");
        // const pythonProcess = spawn("python3", [
        //     "./recomendations/knn.py",
        //     "./../calls.csv",
        //     req.query.user_id,
        // ]);
        const pythonProcess = spawn("python3", [
            "knn.py",
            "./calls.csv",
            req.query.user_id,
        ]);
        console.log("recomendations 2");
        const answer = []
        pythonProcess.stdout.on("data", (data) => {
            console.log("data", answer.push(JSON.parse(data.toString())));
        });
        pythonProcess.stdout.on("end", (data) => {
            console.log("end", answer[0].prediction );
            res.send(answer[0])
        });
        
        console.log("recomendations 3");
    } catch (error) {
        console.error("Ошибка при создании рекомендации:", error);
    }
};

const getRecomendation = async (req, res) => {
    try {
        console.log("recomendation");
        
        let file = fs.readFileSync('recomendations.json', 'utf8');
        let recomendations = JSON.parse(file);
        if (req.query.user_id && recomendations['prediction'][req.query.user_id]) {
            res.send(recomendations?.prediction[req.query.user_id])
        } else{
            res.send([])
        } 
    } catch (error) {
        console.error("Ошибка при создании рекомендации:", error);
    }
};

module.exports = {
    updateServices,
    getServices,
    getRecomendation,
    getRecomendations,
};
