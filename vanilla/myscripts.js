var memoArray = [];
var memoKey = 'memoArray';

(async function () {
    memoArray = await getItemLocalStorage();
    memoArray.push(new Memo('add memo', 'note'));
})();

window.onload = function () {
    renderItems(memoArray);
};


function setItemLocalStorage(obj) {
    localStorage.setItem(memoKey, JSON.stringify(obj));
}

function getItemLocalStorage(obj) {
    try {
        return JSON.parse(localStorage.setItem(memoKey));
    } catch (e) {
        return [];
    }
}

function addMemo(title, note) {
    memoArray.push(new Memo(title, note));
}

function Memo(title, note) {
    this.title = title;
    this.note = note;
    this.edit = function (txt) {
        this.note = txt;
    };
}


function deleteItem(idx) {
    memoArray.splice(idx, 1);
    renderItems(memoArray);
    setItemLocalStorage(memoArray);
}

function expandItem(idx) {
    let input = document.getElementsByClassName("memo-search")[0];
    if(input.value.length == ""){
        renderItems(memoArray, false, idx);
        return;
    }
    let fliteredArray = memoArray.filter(el => {
        if(el.title.toLowerCase().includes(input.value)){
            return true;
        }else{
            return false;
        }
    })
    renderItems(fliteredArray, false, idx);
}

function collapseItem() {
    let input = document.getElementsByClassName("memo-search")[0];
    if(input.value.length == ""){
        renderItems(memoArray, false);
        return;
    }
    let fliteredArray = memoArray.filter(el => {
        if(el.title.toLowerCase().includes(input.value)){
            return true;
        }else{
            return false;
        }
    })
    renderItems(fliteredArray, false);
}

function editNote(title) {
    let note = document.getElementsByClassName("memo-info")[0];
    let txt = note.textContent;
    if (txt && txt.length > 0) {
        for(let i=0;i<memoArray.length;i++){
            if(memoArray[i].title == title){
                memoArray[i].note = txt;
                break;
            }
        }
        note.classList.remove("alert");
        setItemLocalStorage(memoArray);
    } else {
        note.classList.add("alert");
    }
}

function renderItems(array, search = false, expIdx = undefined) {
    if (!search && (!array || array.length == 0)) {
        showSection(2);
        return;
    }

    if (search && (!array || array.length == 0)) {
        showSection(1);
        return;
    }

    if (array && array.length > 0) {
        var sectionBody = document.getElementsByClassName('section-body')[0];
        var list = document.createElement('ol');
        list.classList.add('memo-list');

        array.forEach((el, idx) => {
            let item = createListItem(el, idx, expIdx);
            if (expIdx != undefined && idx == expIdx) {
                let div = document.createElement('div');
                div.contentEditable = "true";
                div.textContent = el.note;
                div.classList.add("memo-info");
                div.setAttribute("onfocusout", "editNote('"+el.title+"')")
                item.appendChild(div)
            }

            list.appendChild(item);
        });

        sectionBody.innerHTML = '';
        sectionBody.appendChild(list);
        showSection(3);
    }
}

function createListItem(el, idx, expIdx = undefined) {
    let li = document.createElement('li');
    li.classList.add('memo-item');

    let actionItems = document.createElement('ul');
    actionItems.classList.add('memo-action');
    let li_action = document.createElement('li');

    let li_btn_exp = document.createElement('button');

    if (idx == expIdx) {
        li_btn_exp.textContent = "less";
        li_btn_exp.setAttribute("onclick", "collapseItem()");
    } else {
        li_btn_exp.textContent = "view";
        li_btn_exp.setAttribute("onclick", "expandItem(" + idx + ")");
    }

    if(expIdx != undefined && idx != expIdx){
        li.classList.add('low-opacity')
    }

    let li_btn_del = document.createElement('button');
    li_btn_del.textContent = "del";
    li_btn_del.setAttribute("onclick", "deleteItem(" + idx + ")");

    li_action.appendChild(li_btn_exp);
    li_action.appendChild(li_btn_del);

    actionItems.appendChild(li_action);

    li.textContent = el.title;
    li.appendChild(actionItems);

    return li;
}

/**
 * @param {*} section section id
 * 1,2,3 --- search, add, list
 */
function showSection(section) {
    switch (section) {
        case 1:
            document.getElementsByClassName("memo-search-empty")[0].classList.add('show-section');
            document.getElementsByClassName("add-memo-section")[0].classList.remove('show-section');
            document.getElementsByClassName("section-body")[0].classList.remove('show-section');
            document.getElementsByClassName("memo-btn")[0].textContent = "add";
            break;
        case 2:
            document.getElementsByClassName("memo-search-empty")[0].classList.remove('show-section');
            document.getElementsByClassName("add-memo-section")[0].classList.add('show-section');
            document.getElementsByClassName("section-body")[0].classList.remove('show-section');
            break;
        case 3:
            document.getElementsByClassName("memo-search-empty")[0].classList.remove('show-section');
            document.getElementsByClassName("add-memo-section")[0].classList.remove('show-section');
            document.getElementsByClassName("section-body")[0].classList.add('show-section');
            document.getElementsByClassName("memo-btn")[0].textContent = "add";

            break
    }
}

function searchMemo(input) {
    let fliteredArray = memoArray.filter(el => {
        if(el.title.toLowerCase().includes(input.value)){
            return true;
        }else{
            return false;
        }
    })

    renderItems(fliteredArray, true);
}

function viewAddSection() {
    let name = document.getElementsByClassName("memo-btn")[0].textContent;
    if(name == 'add'){
        showSection(2);
        document.getElementsByClassName("memo-btn")[0].textContent = "list"
    }else{
        showSection(3);
    }
}

function addMemoItem() {
    let title = document.getElementById('memo-title').value;
    let note = document.getElementById('memo-note').value;
    if(title.length == 0){
        document.getElementById('memo-title').classList.add('alert');
        return;
    }document.getElementById('memo-title').classList.remove('alert');

    if(note.length == 0){
        document.getElementById('memo-note').classList.add('alert');
        return;
    }document.getElementById('memo-note').classList.remove('alert');
    
    document.getElementById('memo-title').value = "";
    document.getElementById('memo-note').value = "";

    memoArray.unshift(new Memo(title, note));
    renderItems(memoArray);
}