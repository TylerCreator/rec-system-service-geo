const axios = require("axios");
const { connectionManager } = require("../db");
const models = require("../models/models"); // Путь к модели
const fs = require('fs')
// Импортируйте модель Composition

async function createCompositions(compositions) {
  try {
    for (const compositionData of compositions) {
      await createCompositionInDatabase(compositionData);
    }
    // res.send("Композиции успешно обновлены");
    console.log("Композиции успешно обновлены")
  } catch (error) {
    console.error("Ошибка при обновлении композиций:", error);
    // res.status(500).send("Ошибка при обновлении композиций");
    return error;
  }
}
async function createCompositionInDatabase(compositionData) {
  try {
    // Создайте запись композиции в базе данных, передав объект compositionData
    const newComposition = await models.Composition.findOrCreate({where: {id: compositionData.id}, defaults: compositionData});
    console.log("Создана новая композиция:", newComposition);
  } catch (error) {
    console.error("Ошибка при создании композиции:", error);
  }
}

async function createUsers(users) {
  try {
    for (const user in users) {
      const [newUser, created] = await models.User.findOrCreate({ where: { id: user }, defaults: {
        id: user
      }});
    }
    // res.send("Композиции успешно обновлены");
    console.log("Пользователь успешно создан")
  } catch (error) {
    console.error("Ошибка при создании пользователя:", error);
    // res.status(500).send("Ошибка при обновлении композиций");
    return error;
  }
}

const recover = async () => {
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

  let filePath = __dirname + 'inAndOut.json';

	fs.writeFile(filePath, JSON.stringify(inAndOut), () => {
    console.log("write to inAndOut")
  })

  //______________________________________________________________________________________________

  // console.log(inAndOut[263]);
  // console.log(inAndOut[205]);

  const tasks = await models.Call.findAll({
    order: [["id", "ASC"]],
  });

  let compositions = [];

  let acc = {};
  let links = {};
  let datasetLinks = {};
  let taskIdToIndex = {};
  let users = {};

  for (let i = 0; i < tasks.length; i++) {
    let task = tasks[i];
    taskIdToIndex[tasks[i].id] = i;

    if (!users[tasks[i].owner]) {
      users[tasks[i].owner] = true;
    }

    // if (task.id === 7208) {
    //     console.log(task);
    // }

    let inputs = JSON.parse(tasks[i].input);
    let result = JSON.parse(tasks[i].result);
    if (!inAndOut[tasks[i].mid]) continue;
    let { input, output } = inAndOut[tasks[i].mid];

    if (
      result &&
      result.hasOwnProperty("status") &&
      result["status"] === "success" &&
      result.hasOwnProperty("wms_link")
    ) {
      //проходимся по всем входным значениям
      for (let paramName in input) {
        if (acc.hasOwnProperty(inputs[paramName])) {
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
        if (links[id]) {
          links[id].map((link) => {
            let sourceId = tasks[taskIdToIndex[link["source"]]].id;
            let sourceMid = tasks[taskIdToIndex[link["source"]]].mid;
            if (localLinks[`${sourceId}:${nodeRaw.id}`]) {
              localLinks[`${sourceId}:${nodeRaw.id}`].value.push(link.value);
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
            let [sourceParamName, targetParamName] = params.split(":");
            node.inputs.push({
              name: targetParamName,
              value: `ref::${localLinks[link].source}::${sourceParamName}`,
              type: inAndOut[localLinks[link].targetMid].input[targetParamName],
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
      let id = '';
      nodes = nodes.map((node, index) => {
        node.id = `task/${index + 1}`;
        taskIdToLokalId[node.taskId] = node.id;
        if (id !== '') {
          id += '_';
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
            let [r, taskId, sourceParamName] = inpt.value.split("::");
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
  console.log("compositions", compositions);
  createCompositions(compositions);
  createUsers(users)
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

const getCompositionStats = async(req, res) => {
  let taskIdToIndex = {};
  let nodes = {}
  let links = {}
  const tasks = await models.Call.findAll({
      order: [["id", "DESC"]],
  });
  for (let i = 0; i < tasks.length; i++) {
    taskIdToIndex[tasks[i].id] = i;
    let inputs = JSON.parse(tasks[i].input);
    let result = JSON.parse(tasks[i].result);


    if (
      inputs.theme && 
      inputs.theme.dataset_id
    ) {
      let dataset_id = inputs.theme.dataset_id;
      let mid = tasks[i].mid;
      let owner = tasks[i].owner;
      if (nodes[dataset_id]) {
        if(nodes[dataset_id][owner]) {
          nodes[dataset_id][owner]++
        } else {
          nodes[dataset_id][owner] = 1
        }
      } else {
        nodes[dataset_id] = {
          id: dataset_id,
          [owner]: 1
        }
      }
      if (nodes[mid]) {
        if(nodes[mid][owner]) {
          nodes[mid][owner]++
        } else {
          nodes[mid][owner] = 1
        }
      } else {
        nodes[mid] = {
          id: mid,
          [owner]: 1
        }
      }
      if (links[`${dataset_id}:${mid}`]) {
        if (links[`${dataset_id}:${mid}`]['stats'][owner]){
          links[`${dataset_id}:${mid}`]['stats'][owner]++
        } else {
          links[`${dataset_id}:${mid}`]['stats'][owner] = 1;
        }
        links[`${dataset_id}:${mid}`]['stats']['total']++;
      } else {
        links[`${dataset_id}:${mid}`] = {
          source: dataset_id,
          target: mid,
          stats: {
            [owner]: 1,
            total: 1
          }
        }
      }
    }
  }
  console.log('nodes', Object.keys(nodes).length)
  console.log('links', Object.keys(links).length)

  const compositions = await models.Composition.findAll();
  let path = {}
  for (let composition of compositions) {
    let composition_elements = composition.nodes
    let lastTaskId =  composition_elements[composition_elements.length - 1]['taskId']
    let owner = tasks[taskIdToIndex[lastTaskId]].owner
    let path_str = ''
    for (let i = 0; i < composition_elements.length; i++){
      let node = composition_elements[i]
      let mid = node.mid
      path_str = path_str + mid + '.'
      if (nodes[mid]) {
        if(nodes[mid][owner]) {
          nodes[mid][owner]++
        } else {
          nodes[mid][owner] = 1
        }
      } else {
        nodes[mid] = {
          id: mid,
          [owner]: 1
        }
      }

      if (i < composition_elements.length - 1) {
        let sourceMid = composition_elements[i].mid;
        let targetMid = composition_elements[i + 1].mid;
        if (links[`${sourceMid}:${targetMid}`]) {
          if (links[`${sourceMid}:${targetMid}`]['stats'][owner]){
            links[`${sourceMid}:${targetMid}`]['stats'][owner]++
          } else {
            links[`${sourceMid}:${targetMid}`]['stats'][owner] = 1;
          }
          links[`${sourceMid}:${targetMid}`]['stats']['total']++;
        } else {
          links[`${sourceMid}:${targetMid}`] = {
            source: sourceMid,
            target: targetMid,
            stats: {
              [owner]: 1,
              total: 1
            }
          }
        }
      }
    }
    path[path_str] = true
  }
  console.log(path)
  console.log('nodes', Object.keys(nodes).length)
  console.log('links', Object.keys(links).length)
  let filePath = __dirname + '/statsGraph.json';
  let result = {
    nodes,
    links
  }
  fs.writeFile(filePath, JSON.stringify(result), () => {
    console.log("write to statsGraph")
  })
    
  res.send(result);
}

const deleteAllCompositions = async (req, res) => {
  try {
    // Используйте метод destroy с пустым объектом в качестве условия,
    // чтобы удалить все композиции
    const deletedCompositionsCount = await models.Composition.destroy({
      where: {},
    });

    // Проверка, чтобы убедиться, что хотя бы одна композиция была удалена
    if (deletedCompositionsCount > 0) {
      // return res.json({ message: 'Все композиции успешно удалены' });
      console.log("Все композиции успешно удалены");
    } else {
      // return res.status(404).json({ error: 'Композиции не найдены' });
      console.log("Композиции не найдены");
    }
  } catch (error) {
    console.error("Ошибка при удалении всех композиций:", error);
    //   res.status(500).json({ error: 'Ошибка при удалении всех композиций' });
  }
};

module.exports = { recover, fetchAllCompositions, getCompositionStats };
