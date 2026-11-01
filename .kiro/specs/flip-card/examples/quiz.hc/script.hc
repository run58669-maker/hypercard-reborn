on openCard
  put "What is 2 + 2?" into field "question"
  put empty into field "answer"
end openCard

on mouseUp
  if the target is "Check" then
    if field "answer" = 4 then
      answer "Correct!"
      go to card 2
    else
      answer "Try again."
    end if
  end if
end mouseUp
