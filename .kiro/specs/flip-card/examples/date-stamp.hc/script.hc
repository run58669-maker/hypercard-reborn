on openCard
  hide field "stamp"
end openCard

on mouseUp
  if the target is "Stamp" then
    put the date into field "stamp"
    show field "stamp"
  end if
end mouseUp
