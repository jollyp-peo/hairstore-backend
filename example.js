const userEmail ='erubizzltd@gmail.com';
const username = userEmail.split('@');
console.log(username);

const arr = ['mon', 'tue', 'wed', 'thur', 'fri', 'sat', 'sun'];
for(let i = 0; i < arr.length; i++){
  const index = arr[i];
  const cap = index.charAt([0]);
  const result = cap.toUpperCase() + index.slice(1);
  console.log(result);
}

const str = 'monday'
const index = str.charAt(0).toUpperCase() + str.slice(1)
console.log(index);

function capWord(word){
  return word.charAt(0).toUpperCase() + word.slice(1);
}
console.log(capWord('possible'));