const axios = require("axios");
const { connectionManager } = require("../db");
const models = require("../models/models"); // Путь к модели
const fs = require("fs");
const { raw } = require("body-parser");
// Импортируйте модель Composition

async function createCompositions(compositions) {
    try {
        for (const compositionData of compositions) {
            await createCompositionInDatabase(compositionData);
        }
        // res.send("Композиции успешно обновлены");
        console.log("Композиции успешно обновлены");
    } catch (error) {
        console.error("Ошибка при обновлении композиций:", error);
        // res.status(500).send("Ошибка при обновлении композиций");
        return error;
    }
}
async function createCompositionInDatabase(compositionData) {
    try {
        // Создайте запись композиции в базе данных, передав объект compositionData
        const newComposition = await models.Composition.findOrCreate({
            where: { id: compositionData.id },
            defaults: compositionData,
        });
        console.log("Создана новая композиция:", newComposition);
    } catch (error) {
        console.error("Ошибка при создании композиции:", error);
    }
}

async function createUsers(users) {
    try {
        for (const user in users) {
            const [newUser, created] = await models.User.findOrCreate({
                where: { id: user },
                defaults: {
                    id: user,
                },
            });
        }
        // res.send("Композиции успешно обновлены");
        console.log("Пользователь успешно создан");
    } catch (error) {
        console.error("Ошибка при создании пользователя:", error);
        // res.status(500).send("Ошибка при обновлении композиций");
        return error;
    }
}

const recover = async (req, res) => {
    /* эта часть алгоритма определяет по каким полям сервиса он может быть связан с другими
    для входных значений (service.params) это поля у которых widget.name === 'file'
    для выходных значений (service.output_params) это поля у которых widget.name === 'file_save'

    на основе этой информации создается объект
    inAndOut = {
      [id - индектификатор сервиса]: {
        type: тип сервиса
        name: название сервиса
        input: названия входных полей по которым сервис может принимать данные из другий сервисов
        externalInput: другие входные поля
        output: названия входных полей по которым сервис может передавать данные в другие сервисы
        externalOutput: другие выходные поля
      }
    }
    _______________________________________________________________________________________________  
  */
    const serviceData = await models.Service.findAll();

    let inAndOut = serviceData.reduce((acc, item) => {
        let externalInput = {};
        let externalOutput = {};
        let input = JSON.parse(item.params).reduce((a, i) => {
            if (i.widget.name === "file") {
                a[i.fieldname] = i.type;
            } else {
                externalInput[i.fieldname] = i.type;
            }

            return a;
        }, {});
        let output = JSON.parse(item.output_params).reduce((a, i) => {
            if (i.widget.name === "file_save") {
                a[i.fieldname] = i.type;
            } else {
                externalOutput[i.fieldname] = i.type;
            }
            return a;
        }, {});
        acc[item.id] = {
            type: item.type,
            name: item.name,
            input: input,
            externalInput: externalInput,
            output: output,
            externalOutput: externalOutput,
        };
        return acc;
    }, {});

    let filePath = __dirname + "inAndOut.json";

    fs.writeFile(filePath, JSON.stringify(inAndOut), () => {
        console.log("write to inAndOut");
    });

    //______________________________________________________________________________________________

    // console.log(inAndOut[263]);
    // console.log(inAndOut[205]);

    /* 
    в этой части алгоритма мы восстанавливаем связи между сервисами 
    мы идем от последней выполненной задачи к первой 
  */
    const tasks = await models.Call.findAll({
        order: [["id", "ASC"]],
    });

    let compositions = [];

    let acc = {};
    /*
    acc = {
      "значение_файла": {
        value: task.id,       // ID задачи, из которой пришло это значение
        name: "paramName"     // имя параметра, через который оно пришло
      },
      ...
    }
    */
    let links = {};
    /* 
      links = {
        [taskId]: [
          {
            source: taskId_источника,
            target: taskId_текущей_задачи,
            value: "имяПоляИсходник:имяПоляПриемник"
          },
          ...
        ],
        ...
      }
    */
    let datasetLinks = {};
    let taskIdToIndex = {}; // id задачи к индексу задачи
    let users = {}; // уникальные id пользователей

    for (let i = 0; i < tasks.length; i++) {
        let task = tasks[i];
        // id задачи к индексу задачи
        taskIdToIndex[tasks[i].id] = i;

        // в этом if я запоминаю id пользователей
        if (!users[tasks[i].owner]) {
            users[tasks[i].owner] = true;
        }

        // if (task.id === 7208) {
        //     console.log(task);
        // }

        let inputs = JSON.parse(tasks[i].input); // входные параметры вызова
        let result = JSON.parse(tasks[i].result); // выходные параметры вызова
        if (!inAndOut[tasks[i].mid]) continue;
        let { input, output } = inAndOut[tasks[i].mid];

        if ((
            result &&
            result.hasOwnProperty("status") &&
            result["status"] === "success" &&
            result.hasOwnProperty("wms_link"))
        ) {
            task.id === 12565 && console.log("result", links, task.id)
            //проходимся по всем входным значениям, которые могут связывать сервисы из объекта inAndOut
            for (let paramName in input) {
                if (
                    acc.hasOwnProperty(inputs[paramName]) &&
                    input[paramName] !== "theme_select"
                ) {
                    let sourceId = acc[inputs[paramName]].value;
                    let sourceParamName = acc[inputs[paramName]].name;
                    if (links[task.id]) {
                        links[task.id].push({
                            source: sourceId,
                            target: task.id,
                            value: `${sourceParamName}:${paramName}`,
                        });
                    } else {
                        links[task.id] = [
                            {
                                source: sourceId,
                                target: task.id,
                                value: `${sourceParamName}:${paramName}`,
                            },
                        ];
                    }
                }
            }

            let stack = [task.id];

            let nodes = [];
            let localLinks = {};
            let flow = [];

            while (stack.length > 0) {
                let id = stack.pop();
                // console.log('task.id', id);
                // task.id === 7208 && console.log('links', links);
                // task.id === 7208 && console.log('acc', acc);
                let nodeRaw = tasks[taskIdToIndex[id]];
                let inputsRaw = JSON.parse(nodeRaw.input);
                let localInputs = [];
                let outputsRaw = JSON.parse(nodeRaw.result);
                let localOutputs = [];
                for (let inpt in inAndOut[nodeRaw.mid].externalInput) {
                    localInputs.push({
                        name: inpt,
                        value: inputsRaw[inpt],
                        type: inAndOut[nodeRaw.mid].externalInput[input],
                    });
                }
                for (let outpt in inAndOut[nodeRaw.mid].externalOutput) {
                    localOutputs.push({
                        name: outpt,
                        value: outputsRaw[outpt],
                        type: inAndOut[nodeRaw.mid].externalOutput[outpt],
                    });
                }
                let node = {
                    mid: nodeRaw.mid,
                    taskId: nodeRaw.id,
                    type: inAndOut[nodeRaw.mid].type,
                    service: inAndOut[nodeRaw.mid].name,
                    owner: nodeRaw.owner,
                    inputs: localInputs,
                    outputs: localOutputs,
                    end_time: nodeRaw.end_time,
                };
                // task.id === 7208 && console.log('localLinks1', localLinks);
                
                if (links[id.toString()]) {
                    links[id.toString()].map((link) => {
                        let sourceId = tasks[taskIdToIndex[link["source"]]].id;
                        let sourceMid =
                            tasks[taskIdToIndex[link["source"]]].mid;
                        if (localLinks[`${sourceId}:${nodeRaw.id}`]) {
                            localLinks[`${sourceId}:${nodeRaw.id}`].value.push(
                                link.value
                            );
                        } else {
                            localLinks[`${sourceId}:${nodeRaw.id}`] = {
                                source: sourceId,
                                sourceMid: sourceMid,
                                target: nodeRaw.id,
                                targetMid: nodeRaw.mid,
                                value: [link.value],
                            };
                        }
                        stack.push(link["source"]);
                    });
                }
                // task.id === 7208 && console.log('localLinks2', localLinks);
                for (let link in localLinks) {
                    for (let params of localLinks[link].value) {
                        let [sourceParamName, targetParamName] =
                            params.split(":");
                        node.inputs.push({
                            name: targetParamName,
                            value: `ref::${localLinks[link].source}::${sourceParamName}`,
                            type: inAndOut[localLinks[link].targetMid].input[
                                targetParamName
                            ],
                        });
                    }
                }
                nodes.push(node);
            }

            nodes.sort((a, b) => {
                let aDate = new Date(a.end_time).getTime();
                let bDate = new Date(b.end_time).getTime();
                if (aDate < bDate) {
                    return -1;
                }
                if (aDate > bDate) {
                    return 1;
                }
                return 0;
            });
            let taskIdToLokalId = {};
            let id = "";
            nodes = nodes.map((node, index) => {
                node.id = `task/${index + 1}`;
                taskIdToLokalId[node.taskId] = node.id;
                if (id !== "") {
                    id += "_";
                }
                id += node.taskId;

                // task.id === 7208 && console.log('node.inputs:', node.inputs);
                node.inputs = node.inputs.map((inpt) => {
                    // task.id === 7208 && console.log('input', inpt)
                    if (
                        inpt.value &&
                        typeof inpt.value === "string" &&
                        inpt.value.includes("ref::")
                    ) {
                        // id +=
                        let [r, taskId, sourceParamName] =
                            inpt.value.split("::");
                        // task.id === 7208 && console.log('taskId',taskIdToLokalId[taskId])
                        inpt.value = `${r}::${taskIdToLokalId[taskId]}::${sourceParamName}`;
                    }
                    return inpt;
                });
                // task.id === 7208 && console.log('node.inputs:', node.inputs);
                return node;
            });
            localLinks = Object.values(localLinks);
            localLinks = localLinks.map((link) => {
                // task.id === 7208 && console.log(taskIdToLokalId[link.source], taskIdToLokalId[link.target])
                return {
                    ...link,
                    source: taskIdToLokalId[link.source],
                    target: taskIdToLokalId[link.target],
                };
            });
            if (nodes.length > 1) {
                compositions.push({
                    id: id,
                    nodes: nodes,
                    links: localLinks,
                });
            }

            // тут должно быть создание композиции !!!!!!!!!
            // nodes (хранит  массив tasks), link (хранит массив flow), compositions
        } else {
            for (let paramName in input) {
                if (acc.hasOwnProperty(inputs[paramName])) {
                    // если этот параметр был результатом другого вызова сервиса
                    let sourceId = acc[inputs[paramName]].value;
                    let sourceParamName = acc[inputs[paramName]].name;
                    if (links[task.id]) {
                        links[task.id].push({
                            source: sourceId,
                            target: task.id,
                            value: `${sourceParamName}:${paramName}`,
                        });
                    } else {
                        links[task.id] = [
                            {
                                source: sourceId,
                                target: task.id,
                                value: `${sourceParamName}:${paramName}`,
                            },
                        ];
                    }
                } else {
                    // тут только внешние параметры
                    // тут можно как-то обработать и сохранить внешние параметры
                }
            }
            if (result) {
                for (let paramName in output) {
                    if (acc.hasOwnProperty(result[paramName])) {
                        // тут мы перезаписываем файл для связи с новой задачей
                        acc[result[paramName]] = {
                            value: task.id,
                            name: paramName,
                        };
                    } else {
                        // тут мы записываем все выходы (результаты) выполнения задачи в аккамулятор
                        acc[result[paramName]] = {
                            value: task.id,
                            name: paramName,
                        };
                    }
                }
            }
        }
    }
    createCompositions(compositions);
    createUsers(users);
};

const fetchAllCompositions = async (req, res) => {
    try {
        // Используйте метод findAll, чтобы получить все композиции из базы данных
        const compositions = await models.Composition.findAll();

        // Отправьте полученные композиции в формате JSON в ответе
        console.log(compositions);
        res.send(compositions);
    } catch (error) {
        console.error("Ошибка при получении композиций:", error);
        res.status(500).json({ error: "Ошибка при получении композиций" });
    }
};

const getCompositionStats = async (req, res) => {
    let taskIdToIndex = {};
    let nodes = {};
    let links = {};
    const tasks = await models.Call.findAll({
        order: [["id", "DESC"]],
    });
    for (let i = 0; i < tasks.length; i++) {
        taskIdToIndex[tasks[i].id] = i;
        let inputs = JSON.parse(tasks[i].input);
        let result = JSON.parse(tasks[i].result);

        if (inputs.theme && inputs.theme.dataset_id) {
            let dataset_id = inputs.theme.dataset_id;
            let mid = tasks[i].mid;
            let owner = tasks[i].owner;
            if (nodes[dataset_id]) {
                if (nodes[dataset_id][owner]) {
                    nodes[dataset_id][owner]++;
                } else {
                    nodes[dataset_id][owner] = 1;
                }
            } else {
                nodes[dataset_id] = {
                    id: dataset_id,
                    [owner]: 1,
                };
            }
            if (nodes[mid]) {
                if (nodes[mid][owner]) {
                    nodes[mid][owner]++;
                } else {
                    nodes[mid][owner] = 1;
                }
            } else {
                nodes[mid] = {
                    id: mid,
                    [owner]: 1,
                };
            }
            if (links[`${dataset_id}:${mid}`]) {
                if (links[`${dataset_id}:${mid}`]["stats"][owner]) {
                    links[`${dataset_id}:${mid}`]["stats"][owner]++;
                } else {
                    links[`${dataset_id}:${mid}`]["stats"][owner] = 1;
                }
                links[`${dataset_id}:${mid}`]["stats"]["total"]++;
            } else {
                links[`${dataset_id}:${mid}`] = {
                    source: dataset_id,
                    target: mid,
                    stats: {
                        [owner]: 1,
                        total: 1,
                    },
                };
            }
        }
    }
    console.log("nodes", Object.keys(nodes).length);
    console.log("links", Object.keys(links).length);

    const compositions = await models.Composition.findAll();
    let path = {};
    for (let composition of compositions) {
        let composition_elements = composition.nodes;
        let lastTaskId =
            composition_elements[composition_elements.length - 1]["taskId"];
        let owner = tasks[taskIdToIndex[lastTaskId]].owner;
        let path_str = "";
        for (let i = 0; i < composition_elements.length; i++) {
            let node = composition_elements[i];
            let mid = node.mid;
            path_str = path_str + mid + ".";
            if (nodes[mid]) {
                if (nodes[mid][owner]) {
                    nodes[mid][owner]++;
                } else {
                    nodes[mid][owner] = 1;
                }
            } else {
                nodes[mid] = {
                    id: mid,
                    [owner]: 1,
                };
            }

            if (i < composition_elements.length - 1) {
                let sourceMid = composition_elements[i].mid;
                let targetMid = composition_elements[i + 1].mid;
                if (links[`${sourceMid}:${targetMid}`]) {
                    if (links[`${sourceMid}:${targetMid}`]["stats"][owner]) {
                        links[`${sourceMid}:${targetMid}`]["stats"][owner]++;
                    } else {
                        links[`${sourceMid}:${targetMid}`]["stats"][owner] = 1;
                    }
                    links[`${sourceMid}:${targetMid}`]["stats"]["total"]++;
                } else {
                    links[`${sourceMid}:${targetMid}`] = {
                        source: sourceMid,
                        target: targetMid,
                        stats: {
                            [owner]: 1,
                            total: 1,
                        },
                    };
                }
            }
        }
        path[path_str] = true;
    }
    console.log(path);
    console.log("nodes", Object.keys(nodes).length);
    console.log("links", Object.keys(links).length);
    let filePath = __dirname + "/statsGraph.json";
    let result = {
        nodes,
        links,
    };
    fs.writeFile(filePath, JSON.stringify(result), () => {
        console.log("write to statsGraph");
    });

    res.send(result);
};

const recoverNew = async (req, res) => {
    /* эта часть алгоритма определяет по каким полям сервиса он может быть связан с другими
    для входных значений (service.params) это поля у которых widget.name === 'file'
    для выходных значений (service.output_params) это поля у которых widget.name === 'file_save'

    на основе этой информации создается объект
    inAndOut = {
      [id - индектификатор сервиса]: {
        type: тип сервиса
        name: название сервиса
        input: названия входных полей по которым сервис может принимать данные из другий сервисов
        externalInput: другие входные поля
        output: названия входных полей по которым сервис может передавать данные в другие сервисы
        externalOutput: другие выходные поля
      }
    }
    _______________________________________________________________________________________________  
  */
    const serviceData = await models.Service.findAll();

    let inAndOut = serviceData.reduce((acc, item) => {
        let externalInput = {};
        let externalOutput = {};
        let input = JSON.parse(item.params).reduce((a, i) => {
            if (i.widget.name === "file" || i.widget.name === "theme_select") {
                a[i.fieldname] = i.widget.name;
            } else {
                externalInput[i.fieldname] = i.type;
            }

            return a;
        }, {});
        let output = JSON.parse(item.output_params).reduce((a, i) => {
            if (i.widget.name === "file_save") {
                a[i.fieldname] = i.widget.name;
            } else {
                externalOutput[i.fieldname] = i.type;
            }
            return a;
        }, {});
        acc[item.id] = {
            type: item.type,
            name: item.name,
            input: input,
            externalInput: externalInput,
            output: output,
            externalOutput: externalOutput,
        };
        return acc;
    }, {});

    let filePath = __dirname + "inAndOut.json";

    fs.writeFile(filePath, JSON.stringify(inAndOut), () => {
        console.log("write to inAndOut");
    });

    //______________________________________________________________________________________________

    /* 
      в этой части алгоритма сопоставляет guid и id для datasets
      ____________________________________________________________________________________________
    */
    const datasets = await models.Dataset.findAll();
    let datasets_guid_to_id = {};
    for (let dataset of datasets) {
        if (dataset.guid) {
            datasets_guid_to_id[dataset.guid] = dataset.id;
        }
    }
    /* 
      ____________________________________________________________________________________________
    */

    /* 
      в этой части алгоритма мы восстанавливаем связи между сервисами 
      мы идем от последней выполненной задачи к первой 
    */
    const calls = await models.Call.findAll({
        order: [["id", "ASC"]],
    });

    let links_from_datasets = {};
    /*
      links_from_datasets = {
        [call.id]: `${dataset_id}:${input_param_name}
      }
    */
    let edges_service_with_datasets = {};
    /*
      edges_with_datasets = {
        [dataset.id]: {
          [service.id]: {
            [owner.id]: number_of_transacrions,
            total: number_of_transacrions,
          }
        }
      }
    */
    let links_by_filename = {};
    /*   
    links_by_filename = {
      "значение_файла": {
        source_call_id: call.id,       // ID задачи, из которой пришло это значение
        source_service_id: call.mid      // ID сервиса, из которой пришло это значение
        source_param_name: "paramName"     // имя параметра, через который оно пришло
      },
      ...
    }
    */

    let calls_edges = {
    
    }
    /*   
    calls_edges = {
      [source_call_id]: {
        [target_call_id] : [
            имяПоляИсходник:имяПоляПриемник"
        ]
       
      },
      ...
    }
    */

    let service_edges = {
    
    }
    /*   
    service_edges = {
      [source_service_id]: {
        [target_service_id] : {
            [source_fieldname]: {
                [target_fieldname]: число тракзакций
            }
            total_transactions: number
        }
       
      },
      ...
    }
    */
    let callIdToIndex = {}; // id задачи к индексу задачи
    let compositions = {};

    let users = {}; // уникальные id пользователей

    for (let i = 0; i < calls.length; i++) {
        let call = calls[i];
        // id задачи к индексу задачи
        callIdToIndex[call.id] = i;

        // в этом if я запоминаю id пользователей
        if (!users[call.owner]) {
            users[call.owner] = true;
        }

        let call_inputs = JSON.parse(call.input); // входные параметры вызова
        let call_result = JSON.parse(call.result); // выходные параметры вызова

        if (!inAndOut[call.mid]) continue;
        let { input: external_input, output: external_output } =
            inAndOut[call.mid];

        if (call.status === "TASK_SUCCEEDED") {
            //проходимся по всем входным значениям и проверяем, есть ли связь с таблицей/датасетом (dataset)
            // ищу используется ли в вызове сервиса таблица
            // заполняю объект links_from_datasets, который связывает вызов сервиса (call.id) и таблицу для создания композиции вызова
            // заполняю объект edges_service_with_datasets, который связывает таблицу с сервисами (service.id) и подсчитывает количество связей
            for (let input_param_name in external_input) {
                // тут мы восставновили связи с таблицами
                if (
                    call_inputs[input_param_name] &&
                    external_input[input_param_name] === "theme_select"
                ) {
                    try {
                        // иногда вместо объекта приходит json строка, мы ее обратно превращаем в объект
                        if (typeof call_inputs[input_param_name] === "string") {
                            call_inputs[input_param_name] = JSON.parse(
                                call_inputs[input_param_name]
                            );
                        }
                        // у типа поля theme_select обязательно должено быть поле dataset_id
                        if (call_inputs[input_param_name].dataset_id) {
                            let dataset_id = call_inputs[input_param_name].dataset_id;
                            // некоторые значения могут приходить в виде guid aef34bf2-d59e-4961-a45a-8fda74279b1a
                            // мы их преобразуем обратно к id таблицы 1918
                            if (datasets_guid_to_id[dataset_id]) {
                                dataset_id = datasets_guid_to_id[dataset_id];
                            }
                            // некоторые значения могут приходить в виде строки, мы их преобразуем в число
                            if (typeof dataset_id === "string") {
                                dataset_id = parseInt(dataset_id, 10);
                            }
                            // к id таблиц добавляем 1000000, чтобы отличать их от сервисов
                            dataset_id = dataset_id + 1000000;
                            links_from_datasets[call.id] = `${dataset_id}:${input_param_name}`;
                            if (edges_service_with_datasets[dataset_id]) {
                                if (edges_service_with_datasets[dataset_id][call.mid]) {
                                    if (edges_service_with_datasets[dataset_id][call.mid][call.owner]) {
                                        edges_service_with_datasets[dataset_id][call.mid][call.owner]++;
                                        edges_service_with_datasets[dataset_id][call.mid].total++;
                                    } else {
                                        edges_service_with_datasets[dataset_id][call.mid] = {
                                            ...edges_service_with_datasets[dataset_id][call.mid],
                                           [call.owner]: 1,                                           
                                        };
                                        edges_service_with_datasets[dataset_id][call.mid].total++
                                    }
                                   
                                } else {
                                    edges_service_with_datasets[dataset_id] = {
                                        ...edges_service_with_datasets[dataset_id],
                                        [call.mid]: {
                                            [call.owner]: 1,
                                            total: 1,
                                        },
                                    };
                                }
                            } else {
                                edges_service_with_datasets[dataset_id] = {
                                    [call.mid]: {
                                        [call.owner]: 1,
                                        total: 1,
                                    }
                                };
                            }
                        }
                    } catch (e) {}
                }

                if (
                    call_inputs[input_param_name] &&
                    external_input[input_param_name] === "file" &&
                    links_by_filename[call_inputs[input_param_name]]
                ) {
                    let filename = call_inputs[input_param_name]
                    let source_call_id = links_by_filename[filename].source_call_id
                    let source_param_name = links_by_filename[filename].source_param_name
                    if (calls_edges[call.id]) {
                        if (calls_edges[call.id][source_call_id]) {
                            calls_edges[call.id][source_call_id].push(`${source_param_name}:${input_param_name}`)
                        } else {
                            calls_edges[call.id] = {
                                ...calls_edges[call.id],
                                [source_call_id]: [`${source_param_name}:${input_param_name}`],
                            };
                        }
                    } else {
                        calls_edges[call.id] = {
                            [source_call_id]: [`${source_param_name}:${input_param_name}`]
                        }
                    }
                    let source_service_id = links_by_filename[filename].source_service_id
                    if (service_edges[source_service_id]) {
                        if (service_edges[source_service_id][call.mid]) {
                            if (service_edges[source_service_id][call.mid][source_param_name]) {
                                if (service_edges[source_service_id][call.mid][source_param_name][input_param_name]) {
                                    service_edges[source_service_id][call.mid][source_param_name][input_param_name]++;
                                    service_edges[source_service_id][call.mid].total_transactions++
                                } else {
                                    service_edges[source_service_id][call.mid] = {
                                        ...service_edges[source_service_id][call.mid],
                                        [source_param_name]: {
                                            ...service_edges[source_service_id][call.mid][source_param_name],
                                            [input_param_name]: 1
                                        },
                                    }
                                    service_edges[source_service_id][call.mid].total_transactions++
                                }
                            } else {
                                service_edges[source_service_id][call.mid] = {
                                    ...service_edges[source_service_id][call.mid],
                                    [source_param_name]: {
                                        [input_param_name]: 1
                                    },
                                }
                                service_edges[source_service_id][call.mid].total_transactions++
                            }
                        } else {
                            service_edges[source_service_id] = {
                                ...service_edges[source_service_id],
                                [call.mid]: {
                                    [source_param_name]: {
                                        [input_param_name]: 1
                                    },
                                    total_transactions: 1
                                },
                            };
                        }
                    } else {
                        service_edges[source_service_id] = {
                            [call.mid]: {
                                [source_param_name]: {
                                    [input_param_name]: 1
                                },
                                total_transactions: 1
                            }
                        }
                    }
                }
            }

            for (let output_param_name in external_output) {
                if (
                    call_result &&
                    call_result[output_param_name] &&
                    external_output[output_param_name] === "file_save" 
                ) {
                    links_by_filename[call_result[output_param_name]] = {
                        source_call_id: call.id,      
                        source_service_id: call.mid,      
                        source_param_name: output_param_name 
                    }
                }
            }
        }
    }
    
    let rawCompositions = {}
    for (let i = 0; i < calls.length; i++) {
        let call = calls[i];
        // id задачи к индексу задачи
        callIdToIndex[call.id] = i;

        // в этом if я запоминаю id пользователей
        if (!users[call.owner]) {
            users[call.owner] = true;
        }

        let call_inputs = JSON.parse(call.input); // входные параметры вызова
        let call_result = JSON.parse(call.result); // выходные параметры вызова

        if (!inAndOut[call.mid]) continue;
        let { input: external_input, output: external_output } =
            inAndOut[call.mid];

        if (call.status === "TASK_SUCCEEDED") {
            if (links_from_datasets[call.id]) {
                let [dataset_id, paramName] =  links_from_datasets[call.id].split(":");
                if (rawCompositions[call.id]) {
                    rawCompositions[call.id] = {
                        nodes: [{id: dataset_id, start_date: call.start_date}, ...rawCompositions[call.id].nodes, ],
                        links: [{source: dataset_id, target: call.id, fields: `${dataset_id}:${paramName}`}, ...rawCompositions[call.id].links, ]
                    }
                } else {
                    rawCompositions[call.id]= {
                        nodes: [{id: dataset_id, start_date: call.start_date}, call],
                        links: [{source: dataset_id, target: call.id, fields: `${dataset_id}:${paramName}`}]
                    }
                }
            }
            if (calls_edges[call.id]) {
                for (let source_call_id of Object.keys(calls_edges[call.id])) {
                    if (rawCompositions[source_call_id]) {
                        if (rawCompositions[call.id]) {
                            rawCompositions[call.id]= {
                                nodes: [...rawCompositions[source_call_id].nodes, call],
                                links: [...rawCompositions[source_call_id].links, {source: source_call_id, target: call.id, fields: calls_edges[call.id][source_call_id]}]
                            }
                        } else {
                            rawCompositions[call.id]= {
                                nodes: [...rawCompositions[source_call_id].nodes, call],
                                links: [...rawCompositions[source_call_id].links, {source: source_call_id, target: call.id, fields: calls_edges[call.id][source_call_id]}]
                            }
                        }
                       
                    } else {
                        rawCompositions = {
                            ...rawCompositions,
                            [call.id]: {
                                nodes: [
                                    calls[callIdToIndex[source_call_id]],
                                    calls[callIdToIndex[call.id]]
                                ],
                                links: [
                                    {source: source_call_id, target: call.id, fields: calls_edges[call.id][source_call_id]}
                                ]
                            }
                        }
                    }
                } 
            } 
        }
    }
    let call_compoistinos_sequence = []
    let servicies_sequence = []
    for (let composition of Object.values(rawCompositions)) {
        let composition_ids = []
        let composition_services = []
        for (let node of composition.nodes) {
            if (node && node.mid) {
                composition_ids.push(node.id)
                composition_services.push(node.mid)
            }
        }
        call_compoistinos_sequence.push(composition_ids.join("_"))
        servicies_sequence.push(composition_services.join("_"));
    }

    function non_prefix_strings(arr) {
        let output = [];
        for (let i = 0; i < arr.length; i++) {
          let is_prefix = false;
          for (let j = 0; j < arr.length; j++) {
            if (i !== j && arr[j].startsWith(arr[i])) {
              is_prefix = true;
              break;
            }
          }
          if (!is_prefix) {
            output.push(arr[i]);
          }
        }
        return output;
    }
    let longest_comp = non_prefix_strings(call_compoistinos_sequence);
    let longest_service_seq = non_prefix_strings(Array.from(new Set(servicies_sequence))); 
    let res_compositions = [];
    for (let comp of longest_comp) {
        comp = comp.split("_");
        res_compositions.push(rawCompositions[comp[comp.length - 1]]);
    }

    fs.writeFile("compositionsDAG.json", JSON.stringify(res_compositions), () => {
        console.log("compositionsDAG");
    });
    res.send({longest_service_seq,longest_comp, res_compositions });
};

module.exports = {
    recover,
    recoverNew,
    fetchAllCompositions,
    getCompositionStats,
};
